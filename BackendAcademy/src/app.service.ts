import { Injectable } from '@nestjs/common';

// Minimal root-level service, typically wired up to a basic "/" route
// via AppController — often used as a simple sanity check that the API
// is up and reachable.
@Injectable()
export class AppService {
  // Returns a static greeting/identifier string for the API.ß
  getHello(): string {
    return 'RustAcademy BackendAcademy API';
  }
}