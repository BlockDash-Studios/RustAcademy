import { Test } from '@nestjs/testing';
import { HintController } from './hint.controller';
import { HintsModule } from './hint.module';
import { HintService } from './hint.service';

describe('HintsModule', () => {
  it('registers hint controller and service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HintsModule],
    }).compile();

    expect(moduleRef.get(HintController)).toBeInstanceOf(HintController);
    expect(moduleRef.get(HintService)).toBeInstanceOf(HintService);
  });
});
