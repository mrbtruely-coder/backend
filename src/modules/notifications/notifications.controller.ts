import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Headers,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * 1. Fetch Notifications (GET)
   * GET /api/v1/notifications?role=CUSTOMER&page=1&limit=20
   */
  @Get()
  async getNotifications(
    @Query('role') role?: 'CUSTOMER' | 'DHARMA_KARTHA',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('search') search?: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = userIdHeader ? parseInt(userIdHeader, 10) : undefined;
    const isUnreadOnly = unreadOnly === 'true' || unreadOnly === '1';

    return this.notificationsService.getNotifications({
      role: role || 'CUSTOMER',
      userId: !isNaN(userId as number) ? userId : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      category,
      unreadOnly: isUnreadOnly,
      search,
    });
  }

  /**
   * 2. Get Unread Count (GET)
   * GET /api/v1/notifications/unread-count?role=CUSTOMER
   */
  @Get('unread-count')
  async getUnreadCount(
    @Query('role') role?: 'CUSTOMER' | 'DHARMA_KARTHA',
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = userIdHeader ? parseInt(userIdHeader, 10) : undefined;
    return this.notificationsService.getUnreadCount(
      role || 'CUSTOMER',
      !isNaN(userId as number) ? userId : undefined,
    );
  }

  /**
   * 3. Mark Single Notification as Read (PATCH)
   * PATCH /api/v1/notifications/:id/read?role=CUSTOMER
   */
  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @Query('role') role?: 'CUSTOMER' | 'DHARMA_KARTHA',
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = userIdHeader ? parseInt(userIdHeader, 10) : undefined;
    return this.notificationsService.markAsRead(
      parseInt(id, 10),
      role || 'CUSTOMER',
      !isNaN(userId as number) ? userId : undefined,
    );
  }

  /**
   * 4. Mark All Notifications as Read (PATCH / POST)
   * PATCH /api/v1/notifications/mark-all-read?role=CUSTOMER
   */
  @Patch('mark-all-read')
  async markAllAsReadPatch(
    @Query('role') role?: 'CUSTOMER' | 'DHARMA_KARTHA',
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = userIdHeader ? parseInt(userIdHeader, 10) : undefined;
    return this.notificationsService.markAllAsRead(
      role || 'CUSTOMER',
      !isNaN(userId as number) ? userId : undefined,
    );
  }

  @Post('mark-all-read')
  async markAllAsReadPost(
    @Query('role') role?: 'CUSTOMER' | 'DHARMA_KARTHA',
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = userIdHeader ? parseInt(userIdHeader, 10) : undefined;
    return this.notificationsService.markAllAsRead(
      role || 'CUSTOMER',
      !isNaN(userId as number) ? userId : undefined,
    );
  }
}
