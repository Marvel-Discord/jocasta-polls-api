import config from "@/config";
import { DiscordUserProfile } from "@/types";
import { checkUserHasManagementPerms } from "@/utils/checkUserHasManagementPerms";
import { checkUserInServer } from "@/utils/checkUserInServer";

import { Request, Response, NextFunction } from "express";

async function validateAuthAndServerMembership(
  req: Request,
  res: Response,
  guildId: bigint
): Promise<DiscordUserProfile | null> {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }

  const user = req.user as DiscordUserProfile;
  const inServer = await checkUserInServer(user, guildId);

  if (!inServer) {
    res.status(403).json({ message: "Forbidden: Not in server" });
    return null;
  }

  return user;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const user = await validateAuthAndServerMembership(req, res, config.guildId);
  if (!user) return;
  next();
}

function requireManagementPermsForGuild(guildId: bigint) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await validateAuthAndServerMembership(req, res, guildId);
    if (!user) return;

    const hasPerms = await checkUserHasManagementPerms(user, guildId);
    if (!hasPerms) {
      return res
        .status(403)
        .json({ message: "Forbidden: Missing management permissions" });
    }

    next();
  };
}

export function requireManagementPerms(
  req: Request,
  res: Response,
  next: NextFunction
) {
  return requireManagementPermsForGuild(config.guildId)(req, res, next);
}
