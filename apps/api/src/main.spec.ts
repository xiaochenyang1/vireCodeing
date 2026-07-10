import { bootstrapApi } from './main';

describe('bootstrapApi', () => {
  function createNestFactory() {
    const app = {
      setGlobalPrefix: jest.fn(),
      useGlobalFilters: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    };
    const nestFactory = {
      create: jest.fn().mockResolvedValue(app),
    };

    return { app, nestFactory };
  }

  it('validates environment before creating the Nest application', async () => {
    const { nestFactory } = createNestFactory();

    await expect(
      bootstrapApi({
        env: {
          NODE_ENV: 'development',
          PORT: '3000',
          DATABASE_URL: 'https://example.com/database',
          JWT_ACCESS_SECRET: 'access-secret',
        },
        nestFactory,
      }),
    ).rejects.toThrow('DATABASE_URL must use postgresql://');

    expect(nestFactory.create).not.toHaveBeenCalled();
  });

  it('listens on the parsed API port', async () => {
    const { app, nestFactory } = createNestFactory();

    await bootstrapApi({
      env: {
        NODE_ENV: 'development',
        PORT: '3100',
        DATABASE_URL: 'postgresql://truck:truck@localhost:5432/truck_platform',
        JWT_ACCESS_SECRET: 'access-secret',
      },
      nestFactory,
    });

    expect(app.setGlobalPrefix).toHaveBeenCalledWith('api');
    expect(app.listen).toHaveBeenCalledWith(3100);
  });
});
