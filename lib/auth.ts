import { NextRequest } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
);

export interface User {
  id: string;
  email: string;
  name?: string;
  role: 'admin' | 'user';
}

export async function signToken(payload: User): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<User | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as User;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

export async function verifyAuth(request: NextRequest): Promise<User | null> {
  // Check Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return await verifyToken(token);
  }

  // Check cookie
  const cookieToken = request.cookies.get('auth-token')?.value;
  if (cookieToken) {
    return await verifyToken(cookieToken);
  }

  return null;
}

// Middleware helper for protected routes
export async function requireAuth(
  request: NextRequest,
  requiredRole?: 'admin'
): Promise<User> {
  const user = await verifyAuth(request);
  
  if (!user) {
    throw new Error('Unauthorized');
  }

  if (requiredRole === 'admin' && user.role !== 'admin') {
    throw new Error('Forbidden: Admin access required');
  }

  return user;
}

// Example login function (you'd integrate with your auth provider)
export async function login(credentials: {
  email: string;
  password: string;
}): Promise<{ user: User; token: string } | null> {
  // TODO: Implement actual authentication logic
  // This is a placeholder - integrate with your auth provider
  
  // Example: verify credentials against database
  // const user = await db.user.findUnique({ where: { email: credentials.email } });
  // const passwordValid = await bcrypt.compare(credentials.password, user.passwordHash);
  
  // For now, mock authentication
  if (credentials.email && credentials.password) {
    const user: User = {
      id: '1',
      email: credentials.email,
      name: 'Admin User',
      role: 'admin',
    };

    const token = await signToken(user);
    return { user, token };
  }

  return null;
}

// API key authentication (alternative to JWT for webhooks/integrations)
export function verifyApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  const validApiKeys = process.env.API_KEYS?.split(',') || [];
  
  return validApiKeys.includes(apiKey || '');
}

