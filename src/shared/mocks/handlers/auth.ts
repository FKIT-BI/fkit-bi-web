import { HttpResponse } from 'msw';
import { MOCK_CONFIG } from '../config';
import { badRequest, route } from './utils';

export const authHandlers = [
  route(
    'post',
    '/auth/login',
    async ({ request }) => {
      const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
      const errors = [];
      if (!body.username || !/^[A-Za-z0-9._-]{3,64}$/.test(body.username)) errors.push({ path: 'username', code: 'INVALID', message: 'Value is invalid' });
      if (!body.password || body.password.length < 12 || body.password.length > 72) errors.push({ path: 'password', code: 'INVALID', message: 'Value is invalid' });
      if (errors.length) return badRequest('Request body is invalid', errors);
      const username = body.username!.toLowerCase();
      return HttpResponse.json({
        accessToken: MOCK_CONFIG.token,
        tokenType: 'Bearer',
        expiresIn: 1800,
        user: { id: '90000000-0000-0000-0000-000000000001', username, displayName: username === 'demo' ? 'Мастер смены' : username, canCreateUsers: false },
      });
    },
    { auth: false },
  ),
];
