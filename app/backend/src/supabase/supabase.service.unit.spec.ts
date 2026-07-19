import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from './supabase.service';
import { AppConfigService } from '../config';
import {
    SupabaseAuthError,
    SupabaseError,
    SupabaseNetworkError,
    SupabaseSerializationError,
    SupabaseTimeoutError,
    SupabaseUniqueConstraintError,
} from './supabase.errors';
import { createClient } from '@supabase/supabase-js';

// Mock the supabase-js module
jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(),
}));

describe('SupabaseService', () => {
    let service: SupabaseService;
    let mockSupabaseClient: Record<string, jest.Mock>;

    beforeEach(async () => {
        jest.clearAllMocks();

        mockSupabaseClient = {
            from: jest.fn().mockReturnThis(),
            insert: jest.fn(),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
        };

        (createClient as jest.Mock).mockReturnValue(mockSupabaseClient);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SupabaseService,
                {
                    provide: AppConfigService,
                    useValue: {
                        supabaseUrl: 'http://localhost:54321',
                        supabaseAnonKey: 'some-anon-key',
                    },
                },
            ],
        }).compile();

        service = module.get<SupabaseService>(SupabaseService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
        expect(createClient).toHaveBeenCalledWith(
            'http://localhost:54321',
            'some-anon-key',
            expect.objectContaining({ auth: { persistSession: false } })
        );
    });

    // -------------------------------------------------------------------------
    // insertUsername — covers unique constraint, network, and fallback paths
    // -------------------------------------------------------------------------

    describe('insertUsername', () => {
        it('should insert a username successfully', async () => {
            mockSupabaseClient.insert.mockResolvedValue({ error: null });

            await expect(service.insertUsername('alice', 'pubkey')).resolves.not.toThrow();

            expect(mockSupabaseClient.from).toHaveBeenCalledWith('usernames');
            expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
                username: 'alice',
                public_key: 'pubkey',
            });
        });

        it('should throw SupabaseUniqueConstraintError on code 23505', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { code: '23505', message: 'duplicate key value violates unique constraint' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseUniqueConstraintError);
        });

        it('should throw SupabaseNetworkError when message contains "fetch"', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { message: 'fetch failed' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseNetworkError);
        });

        it('should throw SupabaseNetworkError when message contains "network"', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { message: 'network unreachable' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseNetworkError);
        });

        it('should throw SupabaseNetworkError when message contains "connection refused"', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { message: 'ECONNREFUSED: connection refused' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseNetworkError);
        });

        it('should throw SupabaseError on unknown error code', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { message: 'some other error', code: '99999' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseError);
        });
    });

    // -------------------------------------------------------------------------
    // handleError — timeout classification
    // -------------------------------------------------------------------------

    describe('handleError — timeout errors', () => {
        it('should throw SupabaseTimeoutError on PG code 57014 (statement_timeout)', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { code: '57014', message: 'canceling statement due to statement timeout' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseTimeoutError);
        });

        it('should throw SupabaseTimeoutError on PostgREST code PGRST504', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { code: 'PGRST504', message: 'Gateway Timeout' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseTimeoutError);
        });

        it('should throw SupabaseTimeoutError when message contains "timeout"', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { message: 'connection timeout after 30s' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseTimeoutError);
        });

        it('should throw SupabaseTimeoutError when message contains "timed out"', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { message: 'operation timed out' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseTimeoutError);
        });

        it('should set the correct name on SupabaseTimeoutError', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { code: '57014', message: 'statement timeout' },
            });

            const err = await service.insertUsername('alice', 'pubkey').catch((e) => e);
            expect(err.name).toBe('SupabaseTimeoutError');
            expect(err.code).toBe('TIMEOUT');
        });
    });

    // -------------------------------------------------------------------------
    // handleError — auth / authorisation failures
    // -------------------------------------------------------------------------

    describe('handleError — auth errors', () => {
        it('should throw SupabaseAuthError on PostgREST code PGRST301 (JWT expired)', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { code: 'PGRST301', message: 'JWT expired' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseAuthError);
        });

        it('should throw SupabaseAuthError on PostgREST code PGRST302 (JWT invalid)', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { code: 'PGRST302', message: 'JWT invalid' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseAuthError);
        });

        it('should throw SupabaseAuthError on Supabase Auth code invalid_grant', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { code: 'invalid_grant', message: 'Invalid refresh token' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseAuthError);
        });

        it('should throw SupabaseAuthError on Supabase Auth code invalid_token', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { code: 'invalid_token', message: 'Invalid token' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseAuthError);
        });

        it('should throw SupabaseAuthError on Supabase Auth code token_expired', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { code: 'token_expired', message: 'Token has expired' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseAuthError);
        });

        it('should throw SupabaseAuthError when message contains "jwt"', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { message: 'JWT signature verification failed' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseAuthError);
        });

        it('should throw SupabaseAuthError when message contains "unauthorized"', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { message: 'Unauthorized: permission denied' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseAuthError);
        });

        it('should throw SupabaseAuthError when message contains "forbidden"', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { message: 'Forbidden: row-level security policy violated' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseAuthError);
        });

        it('should set the correct name on SupabaseAuthError', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { code: 'PGRST301', message: 'JWT expired' },
            });

            const err = await service.insertUsername('alice', 'pubkey').catch((e) => e);
            expect(err.name).toBe('SupabaseAuthError');
            expect(err.code).toBe('AUTH_ERROR');
        });
    });

    // -------------------------------------------------------------------------
    // handleError — serialization failures
    // -------------------------------------------------------------------------

    describe('handleError — serialization errors', () => {
        it('should throw SupabaseSerializationError on PG code 40001 (serialization_failure)', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { code: '40001', message: 'could not serialize access due to concurrent update' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseSerializationError);
        });

        it('should throw SupabaseSerializationError on PG code 40P01 (deadlock_detected)', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { code: '40P01', message: 'deadlock detected' },
            });

            await expect(service.insertUsername('alice', 'pubkey')).rejects.toThrow(SupabaseSerializationError);
        });

        it('should set the correct name on SupabaseSerializationError', async () => {
            mockSupabaseClient.insert.mockResolvedValue({
                error: { code: '40001', message: 'serialization failure' },
            });

            const err = await service.insertUsername('alice', 'pubkey').catch((e) => e);
            expect(err.name).toBe('SupabaseSerializationError');
            expect(err.code).toBe('SERIALIZATION_ERROR');
        });
    });

    // -------------------------------------------------------------------------
    // Error class hierarchy — instanceof checks
    // -------------------------------------------------------------------------

    describe('error class hierarchy', () => {
        it('SupabaseTimeoutError should be instanceof SupabaseError', () => {
            const err = new SupabaseTimeoutError('timeout');
            expect(err).toBeInstanceOf(SupabaseError);
            expect(err).toBeInstanceOf(SupabaseTimeoutError);
        });

        it('SupabaseAuthError should be instanceof SupabaseError', () => {
            const err = new SupabaseAuthError('auth failure');
            expect(err).toBeInstanceOf(SupabaseError);
            expect(err).toBeInstanceOf(SupabaseAuthError);
        });

        it('SupabaseSerializationError should be instanceof SupabaseError', () => {
            const err = new SupabaseSerializationError('serialization failure');
            expect(err).toBeInstanceOf(SupabaseError);
            expect(err).toBeInstanceOf(SupabaseSerializationError);
        });
    });

    // -------------------------------------------------------------------------
    // countUsernamesByPublicKey
    // -------------------------------------------------------------------------

    describe('countUsernamesByPublicKey', () => {
        it('should return count successfully', async () => {
            mockSupabaseClient.eq.mockResolvedValue({ count: 5, error: null });

            const result = await service.countUsernamesByPublicKey('pubkey');

            expect(result).toBe(5);
            expect(mockSupabaseClient.from).toHaveBeenCalledWith('usernames');
            expect(mockSupabaseClient.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
            expect(mockSupabaseClient.eq).toHaveBeenCalledWith('public_key', 'pubkey');
        });

        it('should throw SupabaseAuthError on PGRST301', async () => {
            mockSupabaseClient.eq.mockResolvedValue({
                error: { code: 'PGRST301', message: 'JWT expired' },
            });

            await expect(service.countUsernamesByPublicKey('pubkey')).rejects.toThrow(SupabaseAuthError);
        });

        it('should throw SupabaseTimeoutError on PGRST504', async () => {
            mockSupabaseClient.eq.mockResolvedValue({
                error: { code: 'PGRST504', message: 'Gateway Timeout' },
            });

            await expect(service.countUsernamesByPublicKey('pubkey')).rejects.toThrow(SupabaseTimeoutError);
        });
    });

    // -------------------------------------------------------------------------
    // listUsernamesByPublicKey
    // -------------------------------------------------------------------------

    describe('listUsernamesByPublicKey', () => {
        it('should return list of usernames successfully', async () => {
            const mockData = [{ id: '1', username: 'alice' }];
            mockSupabaseClient.order.mockResolvedValue({ data: mockData, error: null });

            const result = await service.listUsernamesByPublicKey('pubkey');

            expect(result).toEqual(mockData);
            expect(mockSupabaseClient.from).toHaveBeenCalledWith('usernames');
            expect(mockSupabaseClient.select).toHaveBeenCalledWith('id, username, public_key, created_at');
            expect(mockSupabaseClient.eq).toHaveBeenCalledWith('public_key', 'pubkey');
            expect(mockSupabaseClient.order).toHaveBeenCalledWith('created_at', { ascending: true });
        });

        it('should throw SupabaseSerializationError on code 40001', async () => {
            mockSupabaseClient.order.mockResolvedValue({
                error: { code: '40001', message: 'could not serialize access' },
            });

            await expect(service.listUsernamesByPublicKey('pubkey')).rejects.toThrow(SupabaseSerializationError);
        });
    });

    // -------------------------------------------------------------------------
    // checkHealth
    // -------------------------------------------------------------------------

    describe('checkHealth', () => {
        it('should return true if query succeeds', async () => {
            mockSupabaseClient.limit.mockResolvedValue({ error: null });

            const result = await service.checkHealth();

            expect(result).toBe(true);
            expect(mockSupabaseClient.from).toHaveBeenCalledWith('usernames');
            expect(mockSupabaseClient.select).toHaveBeenCalledWith('id');
            expect(mockSupabaseClient.limit).toHaveBeenCalledWith(1);
        });

        it('should return false if query returns an error', async () => {
            mockSupabaseClient.limit.mockResolvedValue({ error: { message: 'db error' } });

            const result = await service.checkHealth();

            expect(result).toBe(false);
        });

        it('should return false if query throws an exception', async () => {
            mockSupabaseClient.limit.mockRejectedValue(new Error('Network error'));

            const result = await service.checkHealth();

            expect(result).toBe(false);
        });
    });
});
