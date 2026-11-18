import { Controller, Get, Query } from '@nestjs/common';
import { MasterService } from './master.service';

@Controller('master')
export class MasterController {
  constructor(private readonly masterService: MasterService) {}

  @Get('rashis')
  async getRashis(@Query('lang') lang?: string) {
    const rashis = await this.masterService.getRashis(lang || 'te');
    return {
      success: true,
      data: rashis,
    };
  }

  @Get('nakshatras')
  async getNakshatras(@Query('lang') lang?: string) {
    const nakshatras = await this.masterService.getNakshatras(lang || 'te');
    return {
      success: true,
      data: nakshatras,
    };
  }

  @Get('deities')
  async getDeities(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('featured') featured?: string,
    @Query('isActive') isActive?: string,
  ) {
    const deities = await this.masterService.getDeities({
      search,
      category,
      featured,
      isActive,
    });
    return {
      success: true,
      data: deities,
      total: deities.length,
    };
  }

  @Get('states')
  async getStates() {
    const states = await this.masterService.getStates();
    return {
      success: true,
      data: states,
      total: states.length,
    };
  }

  @Get('districts')
  async getDistricts(@Query('state') state?: string) {
    const districts = await this.masterService.getDistricts(state);
    return {
      success: true,
      data: districts,
      total: districts.length,
    };
  }
}

