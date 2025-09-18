// Simplified JavaScript version of objectAcl for TheReader
import { File } from "@google-cloud/storage";

const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";

// Simple constants for ObjectAccessGroupType and ObjectPermission
export const ObjectAccessGroupType = {
  PUBLIC: "public"
};

export const ObjectPermission = {
  READ: "read",
  WRITE: "write",
};

// Simple ObjectAclPolicy structure (for documentation purposes)
export const ObjectAclPolicy = {
  // Structure: { owner: string, visibility: "public" | "private", aclRules?: Array }
};

// Check if the requested permission is allowed based on the granted permission.
function isPermissionAllowed(requested, granted) {
  // Users granted with read or write permissions can read the object.
  if (requested === ObjectPermission.READ) {
    return [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted);
  }

  // Only users granted with write permissions can write the object.
  return granted === ObjectPermission.WRITE;
}

// Simple PublicAccessGroup class for TheReader - all files are public
class PublicAccessGroup {
  constructor(id) {
    this.type = ObjectAccessGroupType.PUBLIC;
    this.id = id;
  }

  async hasMember(userId) {
    // For TheReader, all content is public
    return true;
  }
}

function createObjectAccessGroup(group) {
  switch (group.type) {
    case ObjectAccessGroupType.PUBLIC:
      return new PublicAccessGroup(group.id);
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}

// Sets the ACL policy to the object metadata.
export async function setObjectAclPolicy(objectFile, aclPolicy) {
  const [exists] = await objectFile.exists();
  if (!exists) {
    throw new Error(`Object not found: ${objectFile.name}`);
  }

  await objectFile.setMetadata({
    metadata: {
      [ACL_POLICY_METADATA_KEY]: JSON.stringify(aclPolicy),
    },
  });
}

// Gets the ACL policy from the object metadata.
export async function getObjectAclPolicy(objectFile) {
  const [metadata] = await objectFile.getMetadata();
  const aclPolicy = metadata?.metadata?.[ACL_POLICY_METADATA_KEY];
  if (!aclPolicy) {
    return null;
  }
  return JSON.parse(aclPolicy);
}

// Checks if the user can access the object.
export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}) {
  // When this function is called, the acl policy is required.
  const aclPolicy = await getObjectAclPolicy(objectFile);
  if (!aclPolicy) {
    // For TheReader, default to public read access
    return requestedPermission === ObjectPermission.READ;
  }

  // Public objects are always accessible for read.
  if (
    aclPolicy.visibility === "public" &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }

  // Access control requires the user id.
  if (!userId) {
    return requestedPermission === ObjectPermission.READ && aclPolicy.visibility === "public";
  }

  // The owner of the object can always access it.
  if (aclPolicy.owner === userId) {
    return true;
  }

  // Go through the ACL rules to check if the user has the required permission.
  for (const rule of aclPolicy.aclRules || []) {
    const accessGroup = createObjectAccessGroup(rule.group);
    if (
      (await accessGroup.hasMember(userId)) &&
      isPermissionAllowed(requestedPermission, rule.permission)
    ) {
      return true;
    }
  }

  return false;
}