import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Query,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private extractUserId(
    headers: Record<string, any>,
    query: { userId?: string },
    body?: { userId?: number | string },
  ): number {
    const rawId = headers['x-user-id'] || query?.userId || body?.userId;
    const parsed = Number(rawId);
    if (!parsed || isNaN(parsed) || parsed <= 0) {
      throw new BadRequestException('User identification is missing or invalid.');
    }
    return parsed;
  }

  /**
   * GET /api/v1/users/me/profile
   */
  @Get('me/profile')
  async getMyProfile(
    @Headers() headers: Record<string, any>,
    @Query() query: { userId?: string; lang?: string },
  ) {
    const userId = this.extractUserId(headers, query);
    const profile = await this.usersService.getProfile(userId, query.lang || 'te');
    return {
      success: true,
      data: profile,
    };
  }

  /**
   * PATCH /api/v1/users/me/profile
   */
  @Patch('me/profile')
  async updateMyProfile(
    @Headers() headers: Record<string, any>,
    @Query() query: { userId?: string; lang?: string },
    @Body() body: any,
  ) {
    const userId = this.extractUserId(headers, query, body);
    const updated = await this.usersService.updateProfile(userId, body);
    return {
      success: true,
      message: 'Devotee profile updated successfully.',
      data: updated,
    };
  }

  /**
   * POST /api/v1/users/me/profile/photo
   */
  @Post('me/profile/photo')
  async uploadPhoto(
    @Headers() headers: Record<string, any>,
    @Query() query: { userId?: string },
    @Body() body: { userId?: number; imageBase64: string },
  ) {
    const userId = this.extractUserId(headers, query, body);
    if (!body.imageBase64) {
      throw new BadRequestException('imageBase64 is required.');
    }
    const result = await this.usersService.uploadProfilePhoto(userId, body.imageBase64);
    return result;
  }

  /**
   * POST /api/v1/users/me/request-deletion
   * Body: { userId?: number; otp: string; reason?: string }
   */
  @Post('me/request-deletion')
  async requestAccountDeletion(
    @Headers() headers: Record<string, any>,
    @Query() query: { userId?: string },
    @Body() body: { userId?: number; otp: string; reason?: string },
  ) {
    const userId = this.extractUserId(headers, query, body);
    if (!body.otp || body.otp.trim().length !== 6) {
      throw new BadRequestException('Please enter the 6-digit OTP sent to your mobile number.');
    }
    return this.usersService.requestAccountDeletion(userId, body.otp.trim(), body.reason);
  }
}

