import { ApiErrorCode, BusinessError } from '../common/errors';
import type {
  AuthenticatedUser,
  LoginRequest,
  LoginResult,
  RefreshRequest,
  SendCodeRequest,
  SendCodeResult,
  TokenPair,
} from './dto';
import { TokenService } from './token.service';
import { InMemoryVerificationCodeStore } from './verification-code.store';

export class AuthService {
  constructor(
    private readonly codeStore: InMemoryVerificationCodeStore,
    private readonly tokenService: TokenService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async sendCode(request: SendCodeRequest): Promise<SendCodeResult> {
    const expiresAt = new Date(this.now().getTime() + 300 * 1000);

    this.codeStore.saveCode({
      phone: request.phone,
      purpose: request.purpose,
      code: '123456',
      expiresAt,
    });

    return {
      expireSeconds: 300,
      devCode: '123456',
    };
  }

  async login(request: LoginRequest): Promise<LoginResult> {
    const activeCode = this.codeStore.findActiveCode(request.phone, 'login');

    if (!activeCode || activeCode.code !== request.code) {
      throw new BusinessError(ApiErrorCode.AUTH_CODE_INVALID, '验证码错误');
    }

    this.codeStore.consumeCode(activeCode);

    const user: AuthenticatedUser = {
      id: `local-user-${request.phone}`,
      phone: request.phone,
      userType: request.userType,
    };

    return {
      user,
      tokens: this.tokenService.issueTokenPair(user.id),
    };
  }

  async refresh(request: RefreshRequest): Promise<TokenPair> {
    return this.tokenService.refreshTokenPair(request.refreshToken);
  }
}
