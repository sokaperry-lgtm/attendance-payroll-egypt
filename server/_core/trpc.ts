import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "../../shared/const.js";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { getMembership } from "../enterprise";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async (opts) => {
  if (!opts.ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  return opts.next({ ctx: { ...opts.ctx, user: opts.ctx.user } });
});

const requireStaff = t.middleware(async (opts) => {
  if (!opts.ctx.staffUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول بحساب الشركة." });
  return opts.next({ ctx: { ...opts.ctx, staffUser: opts.ctx.staffUser } });
});

const requireManager = t.middleware(async (opts) => {
  if (!opts.ctx.staffUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول بحساب الشركة." });
  if (!["manager", "supervisor"].includes(opts.ctx.staffUser.role) throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  return opts.next({ ctx: { ...opts.ctx, staffUser: opts.ctx.staffUser } });
});

export const protectedProcedure = t.procedure.use(requireUser);
export const staffProcedure = t.procedure.use(requireStaff);
const requireCompanyAdmin = t.middleware(async (opts) => {
  if (!opts.ctx.staffUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول بحساب الشركة." });
  const membership = await getMembership(opts.ctx.staffUser.id);
  if (!membership || !["owner", "hr", "manager", "supervisor", "accountant"].includes(membership.role)) throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  return opts.next({ ctx: { ...opts.ctx, staffUser: opts.ctx.staffUser, membership } });
});

export const managerProcedure = t.procedure.use(requireManager);
export const companyAdminProcedure = t.procedure.use(requireCompanyAdmin);
export const adminProcedure = t.procedure.use(requireManager);
