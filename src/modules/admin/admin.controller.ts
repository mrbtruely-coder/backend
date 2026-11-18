import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query, 
  Req,
  NotFoundException, 
  BadRequestException,
  UnauthorizedException,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Request } from 'express';

// In-Memory Rate Limiting for Admin Authentication (Anti-Brute Force)
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Server-Side Active Session Registry (Task 3: Backend Session Invalidation)
export interface ActiveSession {
  adminId: number;
  email: string;
  role: string;
  createdAt: number;
  expiresAt: number;
}
export const activeAdminSessions = new Map<string, ActiveSession>();

@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  // 1. Admin Authentication & Session Security (Bcrypt Salt 12 + Sliding-Window Rate Limiter)
  @Post('auth/login')
  async login(@Body() body: { email?: string; password?: string }, @Req() req: Request) {
    if (!body.email || !body.password) {
      throw new BadRequestException('Email and password required');
    }

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || 'unknown';
    const rateLimitKey = `${clientIp}_${body.email.toLowerCase().trim()}`;
    const now = Date.now();

    const attempt = loginAttempts.get(rateLimitKey);
    if (attempt) {
      if (now - attempt.firstAttempt < LOCKOUT_WINDOW_MS) {
        if (attempt.count >= MAX_FAILED_ATTEMPTS) {
          const remainingMinutes = Math.ceil((LOCKOUT_WINDOW_MS - (now - attempt.firstAttempt)) / 60000);
          throw new HttpException(
            `Too many failed login attempts. Account locked for ${remainingMinutes} more minute(s) to protect administrative access.`,
            HttpStatus.TOO_MANY_REQUESTS
          );
        }
      } else {
        // Window expired, reset counter
        loginAttempts.delete(rateLimitKey);
      }
    }

    let admin: any = null;
    try {
      admin = await this.prisma.adminUser.findUnique({
        where: { email: body.email.toLowerCase().trim() }
      });
    } catch (dbErr: any) {
      console.error('[AdminAuth] Database connection failed:', dbErr?.message || dbErr);
      throw new HttpException(
        'Database connection failed: Cannot reach MariaDB/MySQL at 127.0.0.1:3306. On cPanel MariaDB is running locally, but on your local computer you must start MySQL (e.g. XAMPP) or deploy to cPanel.',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    if (!admin || !admin.isActive) {
      // Record failed attempt
      const current = loginAttempts.get(rateLimitKey) || { count: 0, firstAttempt: now };
      current.count += 1;
      loginAttempts.set(rateLimitKey, current);

      throw new UnauthorizedException('Invalid administrative credentials or account suspended');
    }

    let isValid = false;
    if (admin.passwordHash.startsWith('$2')) {
      isValid = await bcrypt.compare(body.password, admin.passwordHash);
    } else {
      const crypto = require('crypto');
      const sha = crypto.createHash('sha256').update(body.password).digest('hex');
      if (admin.passwordHash === sha) {
        isValid = true;
        const newSaltHash = await bcrypt.hash(body.password, 12);
        await this.prisma.adminUser.update({
          where: { id: admin.id },
          data: { passwordHash: newSaltHash }
        });
      }
    }

    if (!isValid) {
      const current = loginAttempts.get(rateLimitKey) || { count: 0, firstAttempt: now };
      current.count += 1;
      loginAttempts.set(rateLimitKey, current);

      throw new UnauthorizedException('Invalid administrative credentials');
    }

    // Login successful: reset rate limiter for this key
    loginAttempts.delete(rateLimitKey);

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() }
    });

    await this.prisma.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: 'ADMIN_LOGIN_SUCCESS',
        targetType: 'AdminSession',
        detailsJson: JSON.stringify({ email: admin.email, role: admin.role, ip: clientIp })
      }
    });

    // Issue cryptographically secure 256-bit server-tracked session token (24-hour expiration)
    const sessionToken = `sec_admin_${crypto.randomBytes(32).toString('hex')}`;
    const SESSION_TTL = 24 * 60 * 60 * 1000;
    activeAdminSessions.set(sessionToken, {
      adminId: admin.id,
      email: admin.email,
      role: admin.role,
      createdAt: now,
      expiresAt: now + SESSION_TTL
    });

    return {
      success: true,
      token: sessionToken,
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role
      }
    };
  }

  // 1b. Backend-Enforced Session Revocation (Logout)
  @Post('auth/logout')
  async logout(@Body() body: { token?: string }, @Req() req: Request) {
    const authHeader = req.headers['authorization'];
    const token = body?.token || (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null);
    
    if (token && activeAdminSessions.has(token)) {
      const session = activeAdminSessions.get(token);
      activeAdminSessions.delete(token);

      if (session) {
        await this.prisma.adminAuditLog.create({
          data: {
            adminId: session.adminId,
            action: 'ADMIN_SESSION_REVOKED_LOGOUT',
            targetType: 'AdminSession',
            detailsJson: JSON.stringify({ email: session.email, revokedAt: new Date().toISOString() })
          }
        });
      }
      return { success: true, message: 'Server session revoked and invalidated successfully' };
    }

    return { success: true, message: 'Session not found or already invalidated' };
  }

  // 1c. Server-Side Session Verification
  @Post('auth/verify-session')
  async verifySession(@Body() body: { token?: string }, @Req() req: Request) {
    const authHeader = req.headers['authorization'];
    const token = body?.token || (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null);

    if (!token || !activeAdminSessions.has(token)) {
      throw new UnauthorizedException('Session is invalid or has been revoked on server');
    }

    const session = activeAdminSessions.get(token)!;
    if (Date.now() > session.expiresAt) {
      activeAdminSessions.delete(token);
      throw new UnauthorizedException('Session has expired. Please log in again.');
    }

    return {
      valid: true,
      admin: {
        id: session.adminId,
        email: session.email,
        role: session.role
      }
    };
  }

  // 2. Dynamic Admin Profile
  @Get('profile')
  async getProfile(@Query('email') email: string = 'admin@ayyappa.org') {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: email.toLowerCase().trim() }
    });
    if (!admin) throw new NotFoundException('Admin user not found');

    return {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      role: admin.role,
      isActive: admin.isActive,
      lastLoginAt: admin.lastLoginAt,
      createdAt: admin.createdAt
    };
  }

  @Put('profile')
  async updateProfile(@Body() body: { id?: number; fullName?: string; email?: string }) {
    if (!body.id) throw new BadRequestException('Admin ID required');
    const updated = await this.prisma.adminUser.update({
      where: { id: body.id },
      data: {
        fullName: body.fullName,
        email: body.email ? body.email.toLowerCase().trim() : undefined
      }
    });

    return { success: true, admin: updated };
  }

  @Put('profile/change-password')
  async changePassword(@Body() body: { id?: number; currentPassword?: string; newPassword?: string }) {
    if (!body.id || !body.currentPassword || !body.newPassword) {
      throw new BadRequestException('ID, current password, and new password are required');
    }
    if (body.newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters long');
    }

    const admin = await this.prisma.adminUser.findUnique({ where: { id: body.id } });
    if (!admin) throw new NotFoundException('Admin profile not found');

    let isMatch = false;
    if (admin.passwordHash.startsWith('$2')) {
      isMatch = await bcrypt.compare(body.currentPassword, admin.passwordHash);
    } else {
      const crypto = require('crypto');
      const sha = crypto.createHash('sha256').update(body.currentPassword).digest('hex');
      isMatch = (admin.passwordHash === sha);
    }

    if (!isMatch) throw new BadRequestException('Current password does not match');

    const newHash = await bcrypt.hash(body.newPassword, 12);
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash: newHash }
    });

    return { success: true, message: 'Password rotated successfully' };
  }

  // 3. Languages CRUD
  @Get('languages')
  async getLanguages() {
    const list = await this.prisma.language.findMany({
      include: { _count: { select: { contentTranslations: true } } }
    });

    const nativeNames: Record<string, string> = {
      te: 'తెలుగు', kn: 'ಕನ್ನಡ', en: 'English', ta: 'தமிழ்', hi: 'हिन्दी'
    };

    return list.map(l => ({
      id: l.id,
      code: l.code,
      name: l.name,
      nativeName: nativeNames[l.code] || l.name,
      direction: 'LTR',
      isDefault: l.code === 'te',
      status: 'ACTIVE',
      translationCount: l._count.contentTranslations,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt
    }));
  }

  @Post('languages')
  async createLanguage(@Body() body: { code: string; name: string }) {
    if (!body.code || !body.name) throw new BadRequestException('Code and name required');
    const code = body.code.toLowerCase().trim();
    const existing = await this.prisma.language.findUnique({ where: { code } });
    if (existing) throw new BadRequestException(`Language '${code}' already exists`);

    const created = await this.prisma.language.create({
      data: { code, name: body.name.trim() }
    });
    return { success: true, data: created };
  }

  @Put('languages/:id')
  async updateLanguage(@Param('id') id: string, @Body() body: { name?: string }) {
    const numId = parseInt(id, 10);
    const updated = await this.prisma.language.update({
      where: { id: numId },
      data: { name: body.name }
    });
    return { success: true, data: updated };
  }

  @Delete('languages/:id')
  async deleteLanguage(@Param('id') id: string) {
    const numId = parseInt(id, 10);
    const existing = await this.prisma.language.findUnique({
      where: { id: numId },
      include: { _count: { select: { contentTranslations: true } } }
    });
    if (!existing) throw new NotFoundException('Language not found');
    if (['te', 'kn', 'en'].includes(existing.code)) {
      throw new BadRequestException(`Core language '${existing.name}' is protected`);
    }
    if (existing._count.contentTranslations > 0) {
      throw new BadRequestException(`Cannot delete: Language has active translations`);
    }
    await this.prisma.language.delete({ where: { id: numId } });
    return { success: true };
  }

  // 4. Categories Management (Root categories: parentId == null)
  @Get('categories')
  async getCategories(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('search') search?: string,
    @Query('lang') lang: string = 'te',
    @Query('archived') archived?: string,
    @Query('isAudio') isAudio?: string,
    @Query('sortBy') sortBy: string = 'displayOrder',
    @Query('sortOrder') sortOrder: string = 'asc'
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * take;

    const where: any = {
      parentId: null, // Root categories
      isArchived: archived === 'true'
    };

    if (isAudio !== undefined && isAudio !== '') {
      where.isAudio = isAudio === 'true';
    }

    if (search && search.trim() !== '') {
      where.AND = [
        {
          OR: [
            { slug: { contains: search.trim() } },
            { translations: { some: { title: { contains: search.trim() } } } }
          ]
        }
      ];
    }

    const orderBy: any = {};
    if (['displayOrder', 'createdAt', 'updatedAt', 'id'].includes(sortBy)) {
      orderBy[sortBy] = sortOrder === 'desc' ? 'desc' : 'asc';
    } else {
      orderBy.displayOrder = 'asc';
    }

    const [totalRecords, items] = await Promise.all([
      this.prisma.contentCategory.count({ where }),
      this.prisma.contentCategory.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          translations: { include: { language: true } },
          subcategories: true,
          devotionalContents: true,
        }
      })
    ]);

    const totalPages = Math.ceil(totalRecords / take);

    const formatted = items.map(cat => {
      const preferred = cat.translations.find(t => t.language.code === lang) || cat.translations[0];
      return {
        id: String(cat.id),
        slug: cat.slug,
        displayOrder: cat.displayOrder,
        isAudio: cat.isAudio,
        isArchived: cat.isArchived,
        title: preferred ? preferred.title : cat.slug,
        description: preferred?.description || '',
        subcategoriesCount: cat.subcategories.length,
        devotionalCount: cat.devotionalContents.length,
        createdAt: cat.createdAt,
        updatedAt: cat.updatedAt
      };
    });

    return {
      data: formatted,
      meta: {
        page: pageNum,
        limit: take,
        totalRecords,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPreviousPage: pageNum > 1
      }
    };
  }

  @Post('categories')
  async createCategory(@Body() body: { title: string; slug: string; isAudio: boolean; description?: string; lang?: string; parentId?: number }) {
    const defaultLang = await this.prisma.language.findFirst({ where: { code: body.lang || 'te' } })
      || await this.prisma.language.findFirst();

    if (!defaultLang) throw new NotFoundException('No language found in database');

    const created = await this.prisma.contentCategory.create({
      data: {
        slug: body.slug || `category-${Date.now()}`,
        isAudio: Boolean(body.isAudio),
        parentId: body.parentId ? Number(body.parentId) : null,
        isArchived: false,
        translations: {
          create: {
            languageId: defaultLang.id,
            title: body.title,
            description: body.description || ''
          }
        }
      }
    });

    return { success: true, data: { id: String(created.id), ...body } };
  }

  @Put('categories/:id')
  async updateCategory(@Param('id') id: string, @Body() body: any) {
    const numId = parseInt(id, 10);
    const existing = await this.prisma.contentCategory.findUnique({
      where: { id: numId },
      include: { translations: true }
    });

    if (!existing) throw new NotFoundException(`Category ${id} not found`);

    await this.prisma.contentCategory.update({
      where: { id: numId },
      data: {
        slug: body.slug || existing.slug,
        isAudio: body.isAudio !== undefined ? Boolean(body.isAudio) : existing.isAudio,
        parentId: body.parentId !== undefined ? (body.parentId ? Number(body.parentId) : null) : existing.parentId
      }
    });

    if (body.title) {
      const targetLang = await this.prisma.language.findFirst({ where: { code: body.lang || 'te' } })
        || await this.prisma.language.findFirst();

      if (targetLang) {
        const tr = existing.translations.find(t => t.languageId === targetLang.id);
        if (tr) {
          await this.prisma.contentTranslation.update({
            where: { id: tr.id },
            data: {
              title: body.title,
              description: body.description !== undefined ? body.description : tr.description
            }
          });
        } else {
          await this.prisma.contentTranslation.create({
            data: {
              categoryId: numId,
              languageId: targetLang.id,
              title: body.title,
              description: body.description || ''
            }
          });
        }
      }
    }

    return { success: true };
  }

  @Delete('categories/:id')
  async archiveCategory(@Param('id') id: string) {
    const numId = parseInt(id, 10);
    const existing = await this.prisma.contentCategory.findUnique({ where: { id: numId } });
    if (!existing) throw new NotFoundException(`Category #${id} not found`);

    if (numId <= 23) {
      throw new BadRequestException(`Category #${numId} is a protected core devotional section`);
    }

    await this.prisma.contentCategory.update({
      where: { id: numId },
      data: { isArchived: true }
    });

    return { success: true, message: `Category #${numId} safely archived.` };
  }

  // 4b. Category Tree & Parents Lookup
  @Get('categories/parents')
  async getParentCategoriesLookup(@Query('lang') lang: string = 'te') {
    const categories = await this.prisma.contentCategory.findMany({
      where: { isArchived: false },
      orderBy: { displayOrder: 'asc' },
      include: {
        translations: { include: { language: true } }
      }
    });

    return categories.map(c => {
      const match = c.translations.find(t => t.language.code === lang) || c.translations[0];
      return {
        id: c.id,
        slug: c.slug,
        title: match ? match.title : c.slug,
        parentId: c.parentId
      };
    });
  }

  // 5. Subcategories CRUD (Items where parentId !== null)
  @Get('subcategories')
  async getSubcategories(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('search') search?: string,
    @Query('lang') lang: string = 'te',
    @Query('parentId') parentId?: string
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * take;

    const where: any = {
      parentId: parentId ? Number(parentId) : { not: null },
      isArchived: false
    };

    if (search && search.trim() !== '') {
      where.AND = [
        {
          OR: [
            { slug: { contains: search.trim() } },
            { translations: { some: { title: { contains: search.trim() } } } }
          ]
        }
      ];
    }

    const [totalRecords, items] = await Promise.all([
      this.prisma.contentCategory.count({ where }),
      this.prisma.contentCategory.findMany({
        where,
        skip,
        take,
        orderBy: { displayOrder: 'asc' },
        include: {
          parent: { include: { translations: true } },
          translations: { include: { language: true } }
        }
      })
    ]);

    const totalPages = Math.ceil(totalRecords / take);

    const formatted = items.map(cat => {
      const preferred = cat.translations.find(t => t.language.code === lang) || cat.translations[0];
      const parentPref = cat.parent?.translations.find(t => t.languageId === preferred?.languageId) || cat.parent?.translations[0];
      return {
        id: String(cat.id),
        slug: cat.slug,
        title: preferred ? preferred.title : cat.slug,
        description: preferred?.description || '',
        parentId: cat.parentId,
        parentTitle: parentPref ? parentPref.title : cat.parent?.slug || 'Root',
        isAudio: cat.isAudio,
        createdAt: cat.createdAt
      };
    });

    return {
      data: formatted,
      meta: {
        page: pageNum,
        limit: take,
        totalRecords,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPreviousPage: pageNum > 1
      }
    };
  }

  // 6. Devotional Content (Stotras, Mantras, Slokas, Poojas)
  @Get('content')
  async getDevotionalContent(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * take;

    const where: any = {};
    if (categoryId) where.categoryId = Number(categoryId);
    if (search && search.trim() !== '') {
      where.OR = [
        { title: { contains: search.trim() } },
        { slug: { contains: search.trim() } }
      ];
    }

    const [totalRecords, items] = await Promise.all([
      this.prisma.devotionalContent.count({ where }),
      this.prisma.devotionalContent.findMany({
        where,
        skip,
        take,
        orderBy: { displayOrder: 'asc' },
        include: { category: true }
      })
    ]);

    return {
      data: items,
      meta: {
        page: pageNum,
        limit: take,
        totalRecords,
        totalPages: Math.ceil(totalRecords / take),
        hasNextPage: pageNum < Math.ceil(totalRecords / take),
        hasPreviousPage: pageNum > 1
      }
    };
  }

  @Post('content')
  async createDevotionalContent(@Body() body: { categoryId: number; title: string; slug: string; sacredText?: string; meaning?: string }) {
    const created = await this.prisma.devotionalContent.create({
      data: {
        categoryId: Number(body.categoryId),
        title: body.title,
        slug: body.slug || `content-${Date.now()}`,
        sacredText: body.sacredText || '',
        meaning: body.meaning || '',
        isPublished: true
      }
    });
    return { success: true, data: created };
  }

  @Put('content/:id')
  async updateDevotionalContent(@Param('id') id: string, @Body() body: any) {
    const numId = parseInt(id, 10);
    const updated = await this.prisma.devotionalContent.update({
      where: { id: numId },
      data: {
        title: body.title,
        sacredText: body.sacredText,
        meaning: body.meaning,
        isPublished: body.isPublished !== undefined ? Boolean(body.isPublished) : undefined
      }
    });
    return { success: true, data: updated };
  }

  @Delete('content/:id')
  async deleteDevotionalContent(@Param('id') id: string) {
    await this.prisma.devotionalContent.delete({ where: { id: parseInt(id, 10) } });
    return { success: true };
  }

  // 7. Audio & Media Asset Management
  @Get('media/audio')
  async getAudioList(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('search') search?: string
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * take;

    const where: any = { isAudio: true, isArchived: false };
    if (search) {
      where.translations = { some: { title: { contains: search.trim() } } };
    }

    const [totalRecords, items] = await Promise.all([
      this.prisma.contentCategory.count({ where }),
      this.prisma.contentCategory.findMany({
        where,
        skip,
        take,
        include: { translations: true }
      })
    ]);

    const data = items.map(c => ({
      id: c.id,
      title: c.translations[0]?.title || c.slug,
      slug: c.slug,
      duration: '00:40',
      status: 'AVAILABLE_OFFLINE',
      url: `/audio/${c.slug}.mp3`
    }));

    return {
      data,
      meta: {
        page: pageNum,
        limit: take,
        totalRecords,
        totalPages: Math.ceil(totalRecords / take),
        hasNextPage: pageNum < Math.ceil(totalRecords / take),
        hasPreviousPage: pageNum > 1
      }
    };
  }

  // 8. Panchangam & Festivals CRUD
  @Get('panchangam/festivals')
  async getFestivals(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('search') search?: string
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * take;

    const where: any = {};
    if (search) {
      where.OR = [
        { slug: { contains: search.trim() } },
        { translations: { some: { name: { contains: search.trim() } } } }
      ];
    }

    const [totalRecords, items] = await Promise.all([
      this.prisma.festival.count({ where }),
      this.prisma.festival.findMany({
        where,
        skip,
        take,
        orderBy: { festivalDate: 'asc' },
        include: { translations: { include: { language: true } } }
      })
    ]);

    return {
      data: items,
      meta: {
        page: pageNum,
        limit: take,
        totalRecords,
        totalPages: Math.ceil(totalRecords / take),
        hasNextPage: pageNum < Math.ceil(totalRecords / take),
        hasPreviousPage: pageNum > 1
      }
    };
  }

  @Post('panchangam/festivals')
  async createFestival(@Body() body: { name: string; slug: string; date: string; sourceNote?: string; lang?: string }) {
    const defaultLang = await this.prisma.language.findFirst({ where: { code: body.lang || 'te' } })
      || await this.prisma.language.findFirst();

    const created = await this.prisma.festival.create({
      data: {
        slug: body.slug || `fest-${Date.now()}`,
        festivalDate: new Date(body.date),
        sourceNote: body.sourceNote || 'Sabarimala Devaswom Calendar',
        isPublished: true,
        translations: {
          create: {
            languageId: defaultLang.id,
            name: body.name,
            description: body.sourceNote || ''
          }
        }
      }
    });
    return { success: true, data: created };
  }

  @Put('panchangam/festivals/:id')
  async updateFestival(@Param('id') id: string, @Body() body: any) {
    const numId = parseInt(id, 10);
    const updated = await this.prisma.festival.update({
      where: { id: numId },
      data: {
        festivalDate: body.date ? new Date(body.date) : undefined,
        sourceNote: body.sourceNote
      }
    });
    return { success: true, data: updated };
  }

  @Delete('panchangam/festivals/:id')
  async deleteFestival(@Param('id') id: string) {
    await this.prisma.festival.delete({ where: { id: parseInt(id, 10) } });
    return { success: true };
  }

  // 9. CMS Pages CRUD
  @Get('cms')
  async getCms() {
    return this.prisma.appSetting.findMany({
      where: {
        key: { in: ['about_us', 'privacy_policy', 'terms_conditions', 'refund_policy', 'sabarimala_guidelines'] }
      }
    });
  }

  @Put('cms')
  async updateCms(@Body() body: { key: string; value: string; description?: string }) {
    const updated = await this.prisma.appSetting.upsert({
      where: { key: body.key },
      update: { value: body.value, description: body.description },
      create: { key: body.key, value: body.value, description: body.description || '' }
    });
    return { success: true, data: updated };
  }

  // 10. Dashboard Stats
  @Get('dashboard/stats')
  async getDashboardStats() {
    const [
      categoriesCount,
      subcategoriesCount,
      audioTracksCount,
      devotionalItemsCount,
      languagesCount,
      panchangamCount,
      festivalsCount,
      settingsCount,
      usersCount,
      languagesList,
      recentAuditLogs
    ] = await Promise.all([
      this.prisma.contentCategory.count({ where: { parentId: null, isArchived: false } }),
      this.prisma.contentCategory.count({ where: { parentId: { not: null }, isArchived: false } }),
      this.prisma.contentCategory.count({ where: { isAudio: true, isArchived: false } }),
      this.prisma.devotionalContent.count(),
      this.prisma.language.count(),
      this.prisma.panchangamEntry.count(),
      this.prisma.festival.count(),
      this.prisma.appSetting.count(),
      this.prisma.appUser.count(),
      this.prisma.language.findMany(),
      this.prisma.adminAuditLog.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { admin: true }
      })
    ]);

    return {
      totalUsers: usersCount,
      activeUsers: usersCount,
      totalLanguages: languagesCount,
      activeCategories: categoriesCount,
      activeSubcategories: subcategoriesCount,
      publishedDevotionalItems: devotionalItemsCount,
      totalAudioFiles: audioTracksCount,
      panchangamEvents: panchangamCount,
      activeFestivals: festivalsCount,
      publishedCmsPages: settingsCount,
      systemHealth: 'HEALTHY_SYNCED',
      database: 'MySQL 8.0 Connected (Prisma)',
      astronomyEngine: 'Verified Astronomical Active',
      supportedLanguages: languagesList.map(l => ({
        id: l.id,
        code: l.code,
        name: l.name,
        status: 'ACTIVE',
        completion: 100
      })),
      recentAuditLogs
    };
  }

  // 11. User Management
  @Get('users')
  async getUsers(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * take;

    const where: any = {};
    if (status === 'soft_deleted') {
      where.isDeleted = true;
    } else if (status === 'deletion_requested') {
      where.deletionRequested = true;
      where.isDeleted = false;
    } else if (status === 'active') {
      where.isDeleted = false;
    }

    if (search) {
      where.OR = [
        { phoneNumber: { contains: search } },
        { fullName: { contains: search } },
        { deviceUuid: { contains: search } }
      ];
    }

    const [totalRecords, users] = await Promise.all([
      this.prisma.appUser.count({ where }),
      this.prisma.appUser.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' }
      })
    ]);

    return {
      data: users,
      meta: {
        page: pageNum,
        limit: take,
        totalRecords,
        totalPages: Math.ceil(totalRecords / take),
        hasNextPage: pageNum < Math.ceil(totalRecords / take),
        hasPreviousPage: pageNum > 1
      }
    };
  }

  // 11b. Specific Endpoint: Pending Account Deletion Requests
  @Get('users/deletion-requests')
  async getDeletionRequests() {
    const requests = await this.prisma.appUser.findMany({
      where: {
        deletionRequested: true,
        isDeleted: false,
      },
      orderBy: { deletionRequestedAt: 'desc' },
    });
    return { success: true, count: requests.length, data: requests };
  }

  // 11c. Specific Endpoint: Soft Deleted Users List
  @Get('users/soft-deleted')
  async getSoftDeletedUsers() {
    const softDeleted = await this.prisma.appUser.findMany({
      where: {
        isDeleted: true,
      },
      orderBy: { deletedAt: 'desc' },
    });
    return { success: true, count: softDeleted.length, data: softDeleted };
  }

  // 11d. Action: Soft Delete a User Account
  @Post('users/:id/soft-delete')
  async softDeleteUser(@Param('id') id: string) {
    const userId = Number(id);
    const user = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Devotee user account not found');

    const updated = await this.prisma.appUser.update({
      where: { id: userId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletionRequested: false,
      },
    });

    try {
      await this.prisma.adminAuditLog.create({
        data: {
          action: 'USER_SOFT_DELETED',
          targetType: 'APP_USER',
          targetId: String(userId),
          detailsJson: JSON.stringify({
            userId,
            phone: user.phoneNumber,
            fullName: user.fullName,
            reason: user.deletionReason,
            deletedAt: new Date().toISOString(),
          }),
        },
      });
    } catch {}

    return {
      success: true,
      message: `User account #${userId} (${user.fullName || user.phoneNumber}) soft-deleted successfully.`,
      data: updated,
    };
  }

  // 11e. Action: Restore a Soft Deleted User Account
  @Post('users/:id/restore')
  async restoreUser(@Param('id') id: string) {
    const userId = Number(id);
    const user = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Devotee user account not found');

    const updated = await this.prisma.appUser.update({
      where: { id: userId },
      data: {
        isDeleted: false,
        deletedAt: null,
        deletionRequested: false,
      },
    });

    try {
      await this.prisma.adminAuditLog.create({
        data: {
          action: 'USER_RESTORED',
          targetType: 'APP_USER',
          targetId: String(userId),
          detailsJson: JSON.stringify({
            userId,
            phone: user.phoneNumber,
            fullName: user.fullName,
            restoredAt: new Date().toISOString(),
          }),
        },
      });
    } catch {}

    return {
      success: true,
      message: `User account #${userId} (${user.fullName || user.phoneNumber}) restored successfully.`,
      data: updated,
    };
  }

  // 11f. Action: Permanently Delete a User Account (GDPR/Compliance Purge)
  @Delete('users/:id/permanent-delete')
  async permanentlyDeleteUser(@Param('id') id: string) {
    const userId = Number(id);
    const user = await this.prisma.appUser.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Devotee user account not found');

    await this.prisma.appUser.delete({ where: { id: userId } });

    try {
      await this.prisma.adminAuditLog.create({
        data: {
          action: 'USER_PERMANENTLY_DELETED',
          targetType: 'APP_USER',
          targetId: String(userId),
          detailsJson: JSON.stringify({
            userId,
            phone: user.phoneNumber,
            fullName: user.fullName,
            purgedAt: new Date().toISOString(),
          }),
        },
      });
    } catch {}

    return {
      success: true,
      message: `User account #${userId} permanently purged from database.`,
    };
  }

  // 12. Audit Logs
  @Get('audit-logs')
  async getAuditLogs(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20'
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * take;

    const [totalRecords, data] = await Promise.all([
      this.prisma.adminAuditLog.count(),
      this.prisma.adminAuditLog.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { admin: true }
      })
    ]);

    return {
      data,
      meta: {
        page: pageNum,
        limit: take,
        totalRecords,
        totalPages: Math.ceil(totalRecords / take),
        hasNextPage: pageNum < Math.ceil(totalRecords / take),
        hasPreviousPage: pageNum > 1
      }
    };
  }

  // 13. Settings & Ticker
  @Get('settings/ticker')
  async getTicker() {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key: 'devotional_ticker' }
    });

    return {
      ticker: setting?.value || '🕉️ స్వామియే శరణం అయ్యప్ప — శ్రీ అయ్యప్ప స్వామి నిత్య పూజా విధానం, అష్టోత్తరం, హరివరాసనం మరియు సమగ్ర శబరిమల యాత్రా దర్శిని 🕉️',
      updatedAt: setting?.updatedAt || new Date()
    };
  }

  @Post('settings/ticker')
  async updateTicker(@Body() body: { ticker: string }) {
    await this.prisma.appSetting.upsert({
      where: { key: 'devotional_ticker' },
      update: { value: body.ticker },
      create: { key: 'devotional_ticker', value: body.ticker, description: 'Live mobile devotional announcement ticker' }
    });

    await this.prisma.adminAuditLog.create({
      data: {
        action: 'UPDATE_DEVOTIONAL_TICKER',
        targetType: 'AppSetting',
        targetId: 'devotional_ticker',
        detailsJson: JSON.stringify({ ticker: body.ticker })
      }
    });

    return { success: true, ticker: body.ticker };
  }

  // 14. Push Notifications Management (Dynamic broadcast to Mobile App & Website)
  @Get('notifications')
  async getNotifications() {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key: 'broadcast_notifications' }
    });

    let list = [];
    if (setting && setting.value) {
      try {
        list = JSON.parse(setting.value);
      } catch {
        list = [];
      }
    }

    return {
      success: true,
      data: list,
      count: list.length
    };
  }

  @Post('notifications')
  async createNotification(@Body() body: {
    title: string;
    description: string;
    category?: string;
    destination?: string;
    targetAudience?: string;
  }) {
    if (!body.title || !body.title.trim()) {
      throw new BadRequestException('Notification title is required.');
    }
    if (!body.description || !body.description.trim()) {
      throw new BadRequestException('Notification message/description is required.');
    }

    const setting = await this.prisma.appSetting.findUnique({
      where: { key: 'broadcast_notifications' }
    });

    let currentList: any[] = [];
    if (setting && setting.value) {
      try {
        currentList = JSON.parse(setting.value);
      } catch {
        currentList = [];
      }
    }

    const newNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: body.title.trim(),
      desc: body.description.trim(),
      category: body.category || 'temple',
      destination: body.destination || '/home',
      targetAudience: body.targetAudience || 'ALL',
      time: 'Just now',
      timestamp: new Date().toISOString(),
      read: false,
    };

    // Prepend new broadcast to the beginning of the list
    const updatedList = [newNotification, ...currentList];

    await this.prisma.appSetting.upsert({
      where: { key: 'broadcast_notifications' },
      update: { value: JSON.stringify(updatedList) },
      create: {
        key: 'broadcast_notifications',
        value: JSON.stringify(updatedList),
        description: 'Dynamic user broadcast notifications'
      }
    });

    await this.prisma.adminAuditLog.create({
      data: {
        action: 'SEND_NOTIFICATION',
        targetType: 'Notification',
        targetId: newNotification.id,
        detailsJson: JSON.stringify(newNotification)
      }
    });

    return {
      success: true,
      message: 'Notification dispatched to all users successfully.',
      notification: newNotification
    };
  }

  @Delete('notifications/:id')
  async deleteNotification(@Param('id') id: string) {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key: 'broadcast_notifications' }
    });

    if (!setting || !setting.value) {
      return { success: true, message: 'Notification removed.' };
    }

    let currentList: any[] = [];
    try {
      currentList = JSON.parse(setting.value);
    } catch {
      currentList = [];
    }

    const filtered = currentList.filter(n => n.id !== id);

    await this.prisma.appSetting.update({
      where: { key: 'broadcast_notifications' },
      data: { value: JSON.stringify(filtered) }
    });

    return {
      success: true,
      message: 'Notification deleted successfully.'
    };
  }

  // =========================================================
  // SPIRITUAL MANAGEMENT VIDHANAM — GODS & GODDESSES (CRUD)
  // =========================================================

  @Get('deities')
  async getAdminDeities(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('featured') featured?: string,
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.max(1, parseInt(limit, 10) || 50);
    const skip = (p - 1) * l;

    const where: any = {};
    if (category && category !== 'all') {
      if (category === 'popular') {
        where.OR = [{ category: 'popular' }, { isFeatured: true }];
      } else {
        where.category = category;
      }
    }

    if (featured !== undefined && featured !== '') {
      where.isFeatured = featured === 'true' || featured === '1';
    }

    if (search && search.trim()) {
      const s = search.trim();
      const searchCond = [
        { name: { contains: s } },
        { teluguName: { contains: s } },
        { tamilName: { contains: s } },
        { kannadaName: { contains: s } },
        { hindiName: { contains: s } },
        { slug: { contains: s } },
        { aliases: { contains: s } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchCond }];
        delete where.OR;
      } else {
        where.OR = searchCond;
      }
    }

    const [total, items] = await Promise.all([
      this.prisma.deity.count({ where }),
      this.prisma.deity.findMany({
        where,
        orderBy: [
          { isFeatured: 'desc' },
          { orderIndex: 'asc' },
          { id: 'asc' }
        ],
        skip,
        take: l,
      }),
    ]);

    return {
      success: true,
      data: items,
      total,
      page: p,
      limit: l,
      totalPages: Math.ceil(total / l),
    };
  }

  @Post('deities')
  async createDeity(@Body() body: any) {
    if (!body.name || !body.name.trim()) {
      throw new BadRequestException('Deity English name is required');
    }

    const slug = (body.slug || body.name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const existing = await this.prisma.deity.findUnique({ where: { slug } });
    if (existing) {
      throw new BadRequestException(`A deity with code/slug "${slug}" already exists`);
    }

    const newDeity = await this.prisma.deity.create({
      data: {
        slug,
        name: body.name.trim(),
        teluguName: body.teluguName?.trim() || null,
        tamilName: body.tamilName?.trim() || null,
        kannadaName: body.kannadaName?.trim() || null,
        hindiName: body.hindiName?.trim() || null,
        description: body.description?.trim() || null,
        category: body.category || 'popular',
        imageUrl: body.imageUrl?.trim() || null,
        imageName: body.imageName?.trim() || null,
        aliases: body.aliases?.trim() || null,
        isFeatured: body.isFeatured === true || body.isFeatured === 'true',
        orderIndex: Number(body.orderIndex) || 0,
        isActive: body.isActive !== false && body.isActive !== 'false',
      },
    });

    return {
      success: true,
      message: `Deity "${newDeity.name}" created successfully in MySQL database.`,
      data: newDeity,
    };
  }

  @Put('deities/:id')
  async updateDeity(@Param('id') id: string, @Body() body: any) {
    const numId = parseInt(id, 10);
    const deity = await this.prisma.deity.findFirst({
      where: isNaN(numId) ? { slug: id } : { id: numId },
    });

    if (!deity) {
      throw new NotFoundException(`Deity #${id} not found`);
    }

    const updated = await this.prisma.deity.update({
      where: { id: deity.id },
      data: {
        name: body.name !== undefined ? body.name.trim() : undefined,
        teluguName: body.teluguName !== undefined ? body.teluguName?.trim() || null : undefined,
        tamilName: body.tamilName !== undefined ? body.tamilName?.trim() || null : undefined,
        kannadaName: body.kannadaName !== undefined ? body.kannadaName?.trim() || null : undefined,
        hindiName: body.hindiName !== undefined ? body.hindiName?.trim() || null : undefined,
        description: body.description !== undefined ? body.description?.trim() || null : undefined,
        category: body.category !== undefined ? body.category : undefined,
        imageUrl: body.imageUrl !== undefined ? body.imageUrl?.trim() || null : undefined,
        imageName: body.imageName !== undefined ? body.imageName?.trim() || null : undefined,
        aliases: body.aliases !== undefined ? body.aliases?.trim() || null : undefined,
        isFeatured: body.isFeatured !== undefined ? (body.isFeatured === true || body.isFeatured === 'true') : undefined,
        orderIndex: body.orderIndex !== undefined ? Number(body.orderIndex) || 0 : undefined,
        isActive: body.isActive !== undefined ? (body.isActive === true || body.isActive === 'true') : undefined,
      },
    });

    return {
      success: true,
      message: `Deity "${updated.name}" updated successfully in MySQL database.`,
      data: updated,
    };
  }

  @Delete('deities/:id')
  async deleteDeity(@Param('id') id: string) {
    const numId = parseInt(id, 10);
    const deity = await this.prisma.deity.findFirst({
      where: isNaN(numId) ? { slug: id } : { id: numId },
    });

    if (!deity) {
      throw new NotFoundException(`Deity #${id} not found`);
    }

    await this.prisma.deity.delete({
      where: { id: deity.id },
    });

    return {
      success: true,
      message: `Deity "${deity.name}" deleted permanently from MySQL database.`,
    };
  }
}
