import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';

/**
 * Repository interface for users storage.
 * Isolates persistence concerns from business logic.
 */
export interface IUsersRepository {
  /**
   * Create a new user.
   */
  create(dto: CreateUserDto): { id: number; [key: string]: any };

  /**
   * Get all users.
   */
  findAll(): { id: number; [key: string]: any }[];

  /**
   * Find a user by ID.
   */
  findOne(id: number): { id: number; [key: string]: any } | undefined;

  /**
   * Update a user.
   */
  update(id: number, dto: UpdateUserDto): { id: number; [key: string]: any };

  /**
   * Remove a user.
   */
  remove(id: number): { deleted: number };

  /**
   * Clear all user data (useful for testing).
   */
  clearAll(): void;
}
