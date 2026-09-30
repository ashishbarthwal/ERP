import { z } from 'zod';
import { assignableRoles } from '../../lib/permissions';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1),
  role: z.enum(assignableRoles).default('STAFF'),
});

export const signupSchema = registerSchema.omit({ role: true })
  .extend({ confirmPassword: z.string() })
  .refine(input => input.password === input.confirmPassword, {
    path: ['confirmPassword'], message: 'Passwords do not match',
  });
export const approveUserSchema = z.object({ role: z.enum(assignableRoles) });
export const changeUserRoleSchema = z.object({ role: z.enum(assignableRoles) });
export const setUserActiveSchema = z.object({ active: z.enum(['true', 'false']).transform(value => value === 'true') });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12).max(72).refine(password => Buffer.byteLength(password, 'utf8') <= 72, {
    message: 'New password must be no longer than 72 bytes',
  }),
  confirmPassword: z.string(),
}).refine(input => input.newPassword === input.confirmPassword, {
  path: ['confirmPassword'], message: 'Passwords do not match',
}).refine(input => input.newPassword !== input.currentPassword, {
  path: ['newPassword'], message: 'Choose a password different from your current password',
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
