import { and, eq, isNotNull } from "drizzle-orm";

import { db, userUploadsTable } from "@workspace/db";

import {
  ObjectPermission,
  type ObjectAclPolicy,
} from "./objectAcl";
import { ObjectStorageService } from "./objectStorage";

export const objectStorageService = new ObjectStorageService();
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export function isObjectUploadPath(path: string): boolean {
  return /^\/objects\/uploads\/[0-9a-f-]{36}$/i.test(path);
}

export async function assertOwnedCompletedUpload(
  userId: string,
  objectPath: string,
): Promise<boolean> {
  if (!isObjectUploadPath(objectPath)) {
    return false;
  }

  const [upload] = await db
    .select()
    .from(userUploadsTable)
    .where(
      and(
        eq(userUploadsTable.objectPath, objectPath),
        eq(userUploadsTable.userId, userId),
        isNotNull(userUploadsTable.completedAt),
      ),
    )
    .limit(1);
  if (!upload) {
    return false;
  }

  const file = await objectStorageService.getObjectEntityFile(objectPath);
  return objectStorageService.canAccessObjectEntity({
    userId,
    objectFile: file,
    requestedPermission: ObjectPermission.WRITE,
  });
}

export async function completePrivateImageUpload({
  userId,
  objectPath,
}: {
  userId: string;
  objectPath: string;
}): Promise<boolean> {
  if (!isObjectUploadPath(objectPath)) {
    return false;
  }

  const [upload] = await db
    .select()
    .from(userUploadsTable)
    .where(
      and(
        eq(userUploadsTable.objectPath, objectPath),
        eq(userUploadsTable.userId, userId),
      ),
    )
    .limit(1);
  if (!upload) {
    return false;
  }

  const file = await objectStorageService.getObjectEntityFile(objectPath);
  const [metadata] = await file.getMetadata();
  const actualSize = Number(metadata.size ?? 0);
  const actualContentType = String(metadata.contentType ?? "");
  if (
    actualSize < 1 ||
    actualSize > MAX_IMAGE_SIZE ||
    actualSize > upload.size ||
    actualContentType !== upload.contentType
  ) {
    await file.delete().catch(() => undefined);
    return false;
  }

  const policy: ObjectAclPolicy = {
    owner: userId,
    visibility: "private",
  };
  await objectStorageService.trySetObjectEntityAclPolicy(objectPath, policy);
  await db
    .update(userUploadsTable)
    .set({ completedAt: upload.completedAt ?? new Date() })
    .where(eq(userUploadsTable.objectPath, objectPath));
  return true;
}
