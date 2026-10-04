import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret || !secret.trim()) throw new Error('JWT_SECRET is required');
    return secret;
}

export default class Jwt {
    /**
     * Generate a JWT token
     * @param {object} payload - Payload to be included in the token
     * @param {string} expiresIn - Token expiration time
     * @returns {string} - JWT token
     */
    static generateToken(payload, expiresIn) {
        return jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256', expiresIn });
    }

    /**
     * Verify a JWT token
     * @param {string} token - JWT token
     * @returns {object} - Decoded token
     */
    static verifyToken(token) {
        return jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    }
}
