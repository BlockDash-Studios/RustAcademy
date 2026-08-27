import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { IUsersRepository } from './users.repository.interface';

/**
 * In-memory implementation of the users repository.
 * Stores users in process-local Map.
 */
export class InMemoryUsersRepository implements IUsersRepository {
  private readonly users = new Map<number, { id: number; [key: string]: any }>();
  private nextId = 1;

  create(dto: CreateUserDto): { id: number; [key: string]: any } {
    const user = { ...dto, id: this.nextId++ };
    this.users.set(user.id, user);
    return user;
  }

  findAll(): { id: number; [key: string]: any }[] {
    return Array.from(this.users.values());
  }

  findOne(id: number): { id: number; [key: string]: any } | undefined {
    return this.users.get(id);
  }

  update(id: number, dto: UpdateUserDto): { id: number; [key: string]: any } {
    const user = this.users.get(id);
    if (!user) {
      throw new Error(`User #${id} not found`);
    }
    const updated = { ...user, ...dto };
    this.users.set(id, updated);
    return updated;
  }

  remove(id: number): { deleted: number } {
    const deleted = this.users.delete(id);
    if (!deleted) {
      throw new Error(`User #${id} not found`);
    }
    return { deleted: id };
  }

  clearAll(): void {
    this.users.clear();
    this.nextId = 1;
  }
}
