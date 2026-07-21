import { z } from 'zod';
import type {
  GeocodeRequest,
  ReverseGeocodeRequest,
  ReportDriverLocationRequest,
} from './dto';

const coordinateSchema = z
  .number()
  .finite('坐标必须是有效数字')
  .refine(value => Math.abs(value) <= 180, '坐标超出合法范围');

const latitudeSchema = coordinateSchema.refine(
  value => Math.abs(value) <= 90,
  '纬度必须在 -90 到 90 之间',
);

export const geocodeRequestSchema = z.object({
  address: z
    .string()
    .trim()
    .min(2, '地址至少 2 个字')
    .max(200, '地址最多 200 个字'),
});

export const reverseGeocodeRequestSchema = z.object({
  latitude: latitudeSchema,
  longitude: coordinateSchema,
});

export const reportDriverLocationSchema = z.object({
  latitude: latitudeSchema,
  longitude: coordinateSchema,
  accuracyMeters: z
    .number()
    .finite()
    .min(0)
    .max(5000)
    .optional(),
  orderId: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .transform(value => (value === '' ? undefined : value)),
  source: z.enum(['manual', 'device', 'sandbox']).optional(),
});

export function parseGeocodeRequest(input: unknown): GeocodeRequest {
  return geocodeRequestSchema.parse(input);
}

export function parseReverseGeocodeRequest(
  input: unknown,
): ReverseGeocodeRequest {
  return reverseGeocodeRequestSchema.parse(input);
}

export function parseReportDriverLocationRequest(
  input: unknown,
): ReportDriverLocationRequest {
  return reportDriverLocationSchema.parse(input);
}

export function parseOrderId(input: unknown) {
  return z.string().trim().min(1, '订单 ID 不能为空').max(120).parse(input);
}
