// src/services/groupService.ts
import api from "./api";

export type Group = {
  id: string;
  Group_Name: string;
  Group_Desc: string;
};

export const groupService = {
  // 🔹 Get groups user belongs to
  async getGroups(): Promise<Group[]> {
    const res = await api.get("/group");
    return res.data.groups;
  },

  // 🔹 Create group
  async createGroup(payload: {
    Group_Name: string;
    Group_Desc: string;
  }): Promise<Group> {
    const res = await api.post("/group", payload);
    return res.data.group;
  },

  // 🔹 Join a group
  async joinGroup(groupId: string): Promise<void> {
    const res = await api.post("/group/join", { groupId });
    if (!res.data.success) throw new Error(res.data.error || "Failed to join group");
  },

  // 🔹 Get remaining groups that user hasn't joined
  async getRemainingGroups(): Promise<Group[]> {
    const res = await api.get("/group/remaining");
    return res.data.groups;
  },
};

export async function getUserRoleInGroup(
  groupId: string
): Promise<string> {
  const res = await api.get(`/group/member-role/${groupId}`);
  return res.data.role;
}


export async function deleteGroup(
    groupId: number
    ): Promise<void> {
    const res = await api.delete(`/group/${groupId}`);
    if (!res.data.success) throw new Error(res.data.error || "Failed to delete group");
}

export async function updateGroup(
    groupId: number,
    payload: {
        Group_Name?: string;
        Group_Desc?: string;
    }
): Promise<void> {
    const res = await api.put(`/group/${groupId}`, payload);
    if (!res.data.success) throw new Error(res.data.error || "Failed to update group");
}

export async function getAllAgentByUserID(
    userId: string
): Promise<any> {
    const res = await api.get(`/group/agents/${userId}`);
    return res.data;
}