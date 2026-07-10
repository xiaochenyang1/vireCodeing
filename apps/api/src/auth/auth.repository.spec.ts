import { InMemoryAuthRepository } from './auth.repository';

describe('InMemoryAuthRepository', () => {
  it('creates and reuses local users by phone', async () => {
    const repository = new InMemoryAuthRepository();

    const firstUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
    });
    const secondUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
    });

    expect(firstUser).toEqual({
      id: 'local-user-13800138000',
      phone: '13800138000',
      userType: 'shipper',
      status: 'active',
    });
    expect(secondUser).toEqual(firstUser);
    await expect(repository.findUserById(firstUser.id)).resolves.toEqual(
      firstUser,
    );
    await expect(repository.findUserByPhone('13800138000')).resolves.toEqual(
      firstUser,
    );
  });

  it('updates the existing local user type when the same phone logs in as another mobile role', async () => {
    const repository = new InMemoryAuthRepository();

    const shipperUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
    });
    const driverUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'driver',
    });
    const shipperAgainUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
    });

    expect(driverUser).toEqual({
      ...shipperUser,
      userType: 'driver',
    });
    expect(shipperAgainUser).toEqual(shipperUser);
    await expect(repository.findUserById(shipperUser.id)).resolves.toEqual(
      shipperAgainUser,
    );
  });

  it('stores and preserves password hashes for local mobile users', async () => {
    const repository = new InMemoryAuthRepository();

    const registeredUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
      passwordHash: 'scrypt$hash-one',
    });
    const loginUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
    });
    const changedPasswordUser = await repository.upsertMobileUser({
      phone: '13800138000',
      userType: 'shipper',
      passwordHash: 'scrypt$hash-two',
    });

    expect(registeredUser.passwordHash).toBe('scrypt$hash-one');
    expect(loginUser.passwordHash).toBe('scrypt$hash-one');
    expect(changedPasswordUser.passwordHash).toBe('scrypt$hash-two');
  });

  it('stores and revokes refresh sessions by token and device', async () => {
    const repository = new InMemoryAuthRepository(
      () => new Date('2026-06-26T06:00:00.000Z'),
    );

    await repository.saveRefreshSession({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.local-user-13800138000.604800',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });

    await expect(
      repository.findActiveRefreshSession(
        'refresh.local-user-13800138000.604800',
        'device-1',
      ),
    ).resolves.toMatchObject({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.local-user-13800138000.604800',
      deviceId: 'device-1',
    });

    await repository.revokeRefreshSession(
      'refresh.local-user-13800138000.604800',
      'device-1',
      new Date('2026-06-26T06:00:00.000Z'),
    );

    await expect(
      repository.findActiveRefreshSession(
        'refresh.local-user-13800138000.604800',
        'device-1',
      ),
    ).resolves.toBeUndefined();
  });

  it('revokes active refresh sessions by user and device', async () => {
    const repository = new InMemoryAuthRepository(
      () => new Date('2026-06-26T06:00:00.000Z'),
    );

    await repository.saveRefreshSession({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.same-device-old',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });
    await repository.saveRefreshSession({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.other-device',
      deviceId: 'device-2',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });

    await repository.revokeUserDeviceRefreshSessions(
      'local-user-13800138000',
      'device-1',
      new Date('2026-06-26T06:10:00.000Z'),
    );

    await expect(
      repository.findActiveRefreshSession(
        'refresh.same-device-old',
        'device-1',
      ),
    ).resolves.toBeUndefined();
    await expect(
      repository.findActiveRefreshSession('refresh.other-device', 'device-2'),
    ).resolves.toMatchObject({
      refreshToken: 'refresh.other-device',
      deviceId: 'device-2',
    });
  });

  it('revokes active refresh sessions across all user devices', async () => {
    const repository = new InMemoryAuthRepository(
      () => new Date('2026-06-26T06:00:00.000Z'),
    );

    await repository.saveRefreshSession({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.device-one',
      deviceId: 'device-1',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });
    await repository.saveRefreshSession({
      userId: 'local-user-13800138000',
      refreshToken: 'refresh.device-two',
      deviceId: 'device-2',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });
    await repository.saveRefreshSession({
      userId: 'local-user-13900139000',
      refreshToken: 'refresh.other-user',
      deviceId: 'device-3',
      expiresAt: new Date('2026-07-03T06:00:00.000Z'),
    });

    await repository.revokeUserRefreshSessions(
      'local-user-13800138000',
      new Date('2026-06-26T06:10:00.000Z'),
    );

    await expect(
      repository.findActiveRefreshSession('refresh.device-one', 'device-1'),
    ).resolves.toBeUndefined();
    await expect(
      repository.findActiveRefreshSession('refresh.device-two', 'device-2'),
    ).resolves.toBeUndefined();
    await expect(
      repository.findActiveRefreshSession('refresh.other-user', 'device-3'),
    ).resolves.toMatchObject({
      refreshToken: 'refresh.other-user',
      deviceId: 'device-3',
    });
  });
});
