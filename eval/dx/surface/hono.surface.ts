import { Hono } from 'hono'
import type { Context } from 'hono'
export const app = new Hono()
export const sub = new Hono()
export declare const c: Context
