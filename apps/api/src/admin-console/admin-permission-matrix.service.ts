import {
  buildAdminPermissionMatrix,
  type AdminPermissionMatrix,
} from './admin-permission-matrix';

export class AdminPermissionMatrixService {
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  async getMatrix(): Promise<AdminPermissionMatrix> {
    return buildAdminPermissionMatrix(this.now().toISOString());
  }
}
