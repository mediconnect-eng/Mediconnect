import { Pool, PoolConfig } from 'pg';
import { logger } from '../utils/logger';

const poolConfig: PoolConfig = {
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};

class Database {
    private pool: Pool;
    private static instance: Database;

    private constructor() {
        this.pool = new Pool(poolConfig);

        this.pool.on('error', (err) => {
            logger.error('Unexpected database error:', err);
        });
    }

    public static getInstance(): Database {
        if (!Database.instance) {
            Database.instance = new Database();
        }
        return Database.instance;
    }

    public async query(text: string, params?: any[]) {
        const start = Date.now();
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;
            logger.debug('Executed query', { text, duration, rows: result.rowCount });
            return result;
        } catch (error) {
            logger.error('Database query error:', { text, error });
            throw error;
        }
    }

    public async transaction(callback: (client: any) => Promise<any>) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    public async getClient() {
        return await this.pool.connect();
    }

    public async end() {
        await this.pool.end();
    }
}

export const db = Database.getInstance();
export default db;
