import { Body, Controller, Post } from '@nestjs/common';
import { ok } from '../common/api-response';
import { AuthService } from './auth.service';
import type { LoginRequest, RefreshRequest, SendCodeRequest } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('send-code')
  async sendCode(@Body() body: SendCodeRequest) {
    return ok(await this.authService.sendCode(body));
  }

  @Post('login')
  async login(@Body() body: LoginRequest) {
    return ok(await this.authService.login(body));
  }

  @Post('refresh')
  async refresh(@Body() body: RefreshRequest) {
    return ok(await this.authService.refresh(body));
  }
}
