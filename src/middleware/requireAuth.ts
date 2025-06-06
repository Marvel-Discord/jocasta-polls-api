import config from "@/config";
import { DiscordUserProfile } from "@/types";
import { checkUserHasManagementPerms } from "@/utils/checkUserHasManagementPerms";

import { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

function requireManagementPermsForGuild(guildId: bigint) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated?.() || !req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const hasPerms = await checkUserHasManagementPerms(
      req.user as DiscordUserProfile,
      guildId
    );
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
