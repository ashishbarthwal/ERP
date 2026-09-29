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

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
