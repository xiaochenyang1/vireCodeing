import type { SaveShipperProfileFrequentRoutesRequest } from './dto';
import { ApiErrorCode, BusinessError } from '../common/errors';
import type { ProfileFrequentRoutesRepository } from './profile-frequent-routes.repository';

const PROFILE_FREQUENT_ROUTES_CONFLICT_MESSAGE =
  '常用路线已被其他设备更新，请先拉取最新路线后再保存。';

export class ProfileFrequentRoutesService {
  constructor(private readonly repository: ProfileFrequentRoutesRepository) {}

  async getFrequentRoutes(shipperId: string) {
    return this.repository.findFrequentRoutesByShipperId(shipperId);
  }

  async saveFrequentRoutes(
    shipperId: string,
    input: SaveShipperProfileFrequentRoutesRequest,
  ) {
    const currentFrequentRoutes =
      await this.repository.findFrequentRoutesByShipperId(shipperId);

    if (
      currentFrequentRoutes &&
      input.baseUpdatedAtIso &&
      !isSameInstant(currentFrequentRoutes.updatedAtIso, input.baseUpdatedAtIso)
    ) {
      throw new BusinessError(
        ApiErrorCode.PROFILE_FREQUENT_ROUTES_CONFLICT,
        PROFILE_FREQUENT_ROUTES_CONFLICT_MESSAGE,
      );
    }

    return this.repository.saveFrequentRoutes(shipperId, input);
  }
}

function isSameInstant(leftIso: string, rightIso: string) {
  return Date.parse(leftIso) === Date.parse(rightIso);
}
