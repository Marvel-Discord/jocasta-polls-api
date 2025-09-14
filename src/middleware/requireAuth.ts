import config from "@/config";
import { DiscordUserProfile } from "@/types";
import {
  checkUserHasManagementPerms,
  checkUserInServer,
} from "@/utils/checkDiscordMembership";

import { Request, Response, RequestHandler } from "express";

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

export const requireAuth: RequestHandler = async (req, res, next) => {
  const user = await validateAuthAndServerMembership(req, res, config.guildId);
  if (!user) return;
  next();
};

function requireManagementPermsForGuild(guildId: bigint): RequestHandler {
  return async (req, res, next) => {
    const user = await validateAuthAndServerMembership(req, res, guildId);
    if (!user) return;

    const hasPerms = await checkUserHasManagementPerms(user, guildId);
    if (!hasPerms) {
      res
        .status(403)
        .json({ message: "Forbidden: Missing management permissions" });
      return;
    }

    next();
  };
}

export const requireManagementPerms: RequestHandler =
  requireManagementPermsForGuild(config.guildId);
