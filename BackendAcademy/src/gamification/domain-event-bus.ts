import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { XpEvent } from './xp.types';

@Injectable()
export class DomainEventBus {
  private readonly events = new Subject<XpEvent>();

  publish(event: XpEvent): void {
    this.events.next(event);
  }

  subscribe(handler: (event: XpEvent) => void) {
    return this.events.subscribe(handler);
  }
}
