jest.mock('@nestjs/throttler', () => ({
  ThrottlerModule: {
    forRoot: jest.fn(() => ({
      module: class MockThrottlerModule {},
    })),
  },
}));

import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

describe('AppModule', () => {
  it('compiles the application dependency graph', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await moduleRef.close();
  });
});
