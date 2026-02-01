import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, X, Users, Send } from "lucide-react";
import { groupService, Group,getUserRoleInGroup, deleteGroup, updateGroup } from "../services/groupService";
import { Message, messageService } from "../services/groupMessageService";
import { RealtimeChannel } from "@supabase/supabase-js";
import { groupAgentService, Agent } from "../services/groupAgentService";

type ChatMode = "group" | "agent";


export default function Collab() {
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(
    Number(localStorage.getItem("selectedGroupId")) || null
  );

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false); // ✅ Join modal
  const [remainingGroups, setRemainingGroups] = useState<Group[]>([]); // Groups not joined
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);
  const [showAgentModal, setShowAgentModal] = useState(false);

  const [chatMode, setChatMode] = useState<ChatMode>("group");




  const selectedGroup = groups.find((g) => Number(g.id) === selectedGroupId);

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const currentUserId = user?.id || "";
  const currentUsername = user?.username || "You";

  const [myRole, setMyRole] = useState<string | null>(null);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const isGroupOwner = myRole === "Owner";



  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const loadGroups = async () => {
      try {
        const data = await groupService.getGroups();
        setGroups(data);
      } catch (err) {
        console.error("Failed to load groups", err);
      } finally {
        setLoadingGroups(false);
      }
    };
    loadGroups();
  }, []);


  useEffect(() => {
    if (!selectedGroupId) return;

    let channel: RealtimeChannel;

    const init = async () => {
      try {
        const msgs = await messageService.getMessages(selectedGroupId);
        setMessages(msgs);

        channel = messageService.subscribeToMessages(
          selectedGroupId,
          (message) => setMessages((prev) => [...prev, message])
        );
      } catch (err) {
        console.error("Failed to load messages", err);
      }
    };

    init();

    return () => {
      if (channel) messageService.unsubscribe(channel);
    };
  }, [selectedGroupId]);


  useEffect(() => {
  if (!selectedGroupId) {
    setMyRole(null);
    return;
  }

  getUserRoleInGroup(String(selectedGroupId))
    .then(setMyRole)
    .catch(() => setMyRole(null));
}, [selectedGroupId]);


  useEffect(() => {
    const g = groups.find(g => Number(g.id) === selectedGroupId);
    if (g) {
      setEditName(g.Group_Name);
      setEditDesc(g.Group_Desc);
    }
  }, [selectedGroupId, groups]);

useEffect(() => {
  const loadAgents = async () => {
    try {
      const data = await groupAgentService.getAgents();
      console.log("Agents fetched:", data);

      const allAgents: Agent[] = Array.isArray(data) ? data : [data];
      setAgents(allAgents);
      setActiveAgent(allAgents[0] ?? null);
    } catch (err) {
      console.error("Failed to load agents", err);
      setAgents([]);
      setActiveAgent(null);
    }
  };

  loadAgents();
}, []);

useEffect(() => {
  if (!selectedGroupId) {
    setMessages([]);
  }
}, [selectedGroupId]);


  /* --------------------------
     Handlers
  -------------------------- */
  const handleSelectGroup = (groupId: number) => {
    setSelectedGroupId(groupId);
    localStorage.setItem("selectedGroupId", String(groupId));
  };

  const handleSubmitGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const group = await groupService.createGroup({
        Group_Name: newGroupName,
        Group_Desc: newGroupDescription,
      });
      setGroups((prev) => [...prev, group]);
      handleSelectGroup(Number(group.id));
      setShowCreateForm(false);
      setNewGroupName("");
      setNewGroupDescription("");
    } catch (err: any) {
      alert(err.message || "Failed to create group");
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedGroupId) return;

    try {
      await messageService.sendMessage(selectedGroupId, newMessage.trim());
      setNewMessage("");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to send message");
    }
  };

  const handleOpenJoinModal = async () => {
    try {
      const groups = await groupService.getRemainingGroups();
      setRemainingGroups(groups);
      setShowJoinModal(true);
    } catch (err: any) {
      console.error("Failed to load remaining groups", err);
      alert(err.message || "Failed to load groups");
    }
  };

  const handleJoinGroup = async (groupId: string) => {
    try {
      await groupService.joinGroup(groupId);
      setGroups((prev) => [...prev, remainingGroups.find(g => g.id === groupId)!]);
      setRemainingGroups((prev) => prev.filter((g) => g.id !== groupId));
    } catch (err: any) {
      console.error("Failed to join group", err);
      alert(err.message || "Failed to join group");
    }
  };

  const handleDeleteGroup = async () => {
  if (!selectedGroupId) return;

  const confirmDelete = window.confirm(
    "Are you sure you want to delete this group? This cannot be undone."
  );

  if (!confirmDelete) return;

  try {
    await deleteGroup(selectedGroupId);

    // remove from UI
    setGroups(prev => prev.filter(g => Number(g.id) !== selectedGroupId));
    setSelectedGroupId(null);
  } catch (err: any) {
    alert(err.message || "Failed to delete group");
  }
};

const handleUpdateGroup = async () => {
  if (!selectedGroupId) return;

  try {
    await updateGroup(selectedGroupId, {
      Group_Name: editName,
      Group_Desc: editDesc,
    });

    // optimistic UI update
    setGroups(prev =>
      prev.map(g =>
        Number(g.id) === selectedGroupId
          ? { ...g, Group_Name: editName, Group_Desc: editDesc }
          : g
      )
    );
  } catch (err: any) {
    alert(err.message || "Failed to update group");
  }
};


  /* --------------------------
     JSX
  -------------------------- */
  return (
    <div className="h-screen overflow-hidden bg-gray-50 dark:bg-gray-900 flex flex-col">
      {/* HEADER */}
      <div className="p-4 shrink-0">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      <div className="flex-1 flex gap-4 px-4 pb-4 overflow-hidden">
        {/* GROUP LIST */}
        <div className="w-1/3 min-w-[280px] bg-white dark:bg-gray-800 rounded-lg border shadow flex flex-col">
          <div className="p-4 border-b">
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setShowCreateForm(true)}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg"
              >
                <Plus className="inline h-4 w-4 mr-1" />
                Create
              </button>
              <button
                onClick={handleOpenJoinModal} // ✅ open join modal
                className="flex-1 bg-green-600 text-white py-2 rounded-lg"
              >
                <Users className="inline h-4 w-4 mr-1" />
                Join
              </button>
            </div>
            <h2 className="font-bold text-lg">Groups</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loadingGroups ? (
              <div className="opacity-60">Loading…</div>
            ) : (
              groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => handleSelectGroup(Number(g.id))}
                  className={`w-full p-3 rounded-lg text-left ${
                    Number(g.id) === selectedGroupId
                      ? "bg-blue-100 dark:bg-blue-600"
                      : "hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  <div className="font-medium">{g.Group_Name}</div>
                  <div className="text-xs opacity-70 truncate">{g.Group_Desc}</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* CHAT */}
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg border shadow flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="font-bold">
              {selectedGroup?.Group_Name ?? "Select a group"}
            </div>

            {activeAgent && (
              <div className="flex rounded-lg overflow-hidden border text-sm">
                <button
                  onClick={() => setChatMode("group")}
                  className={`px-3 py-1 ${
                    chatMode === "group"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700"
                  }`}
                >
                  Group
                </button>

                <button
                  onClick={() => setChatMode("agent")}
                  className={`px-3 py-1 ${
                    chatMode === "agent"
                      ? "bg-purple-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700"
                  }`}
                >
                  {activeAgent.name}
                </button>
              </div>
            )}
          </div>


          {isGroupOwner && (
            <div className="relative">
              <button
                onClick={() => setShowGroupMenu((v) => !v)}
                className="px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                ⋮
              </button>

              {showGroupMenu && (
                <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-gray-800 border rounded shadow z-50">
                  <button
                    className="block w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => {
                      setShowAgentModal(true);
                    }}
                  >
                    Add Agent
                  </button>

                  <button
                    className="block w-full px-4 py-2 text-left text-green-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => {
                      setShowGroupMenu(false);
                      setIsEditing(true);
                    }}
                  >
                    Edit group
                  </button>

                                    <button
                    className="block w-full px-4 py-2 text-left text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={handleDeleteGroup}
                  >
                    Delete group
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {chatMode === "group" &&
            messages.map((msg) => {
              const isMe = msg.user_id === currentUserId;

              return (
                <div
                  key={msg.conv_id}
                  className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[70%] p-2 rounded-lg ${
                      isMe
                        ? "bg-blue-600 text-white text-right"
                        : "bg-gray-100 dark:bg-gray-700 text-left"
                    }`}
                  >
                    <div className="text-xs opacity-70 mb-1">
                      {isMe ? currentUsername : "User"}
                    </div>
                    {msg.message}
                  </div>
                </div>
              );
            })}

            <div ref={messagesEndRef} />
          </div>

          {selectedGroupId && (
            <div className="p-4 border-t flex gap-2">
              <input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="flex-1 p-2 border rounded"
                placeholder="Type a message…"
              />
              <button
                onClick={handleSendMessage}
                className="bg-blue-600 text-white px-4 rounded flex items-center gap-1"
              >
                <Send className="h-4 w-4" />
                Send
              </button>
            </div>
          )}
        </div>
      </div>

      {/*create grp */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form
            onSubmit={handleSubmitGroup}
            className="bg-white dark:bg-gray-800 p-6 rounded-lg w-96 space-y-4"
          >
            <div className="flex justify-between">
              <h3 className="font-bold">Create Group</h3>
              <button type="button" onClick={() => setShowCreateForm(false)}>
                <X />
              </button>
            </div>

            <input
              required
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="Group name"
            />

            <textarea
              required
              value={newGroupDescription}
              onChange={(e) => setNewGroupDescription(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="Description"
            />

            <button className="w-full bg-blue-600 text-white py-2 rounded">
              Create
            </button>
          </form>
        </div>
      )}

      {/*join grp*/}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg w-96 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Join a Group</h3>
              <button onClick={() => setShowJoinModal(false)}>
                <X />
              </button>
            </div>
            {remainingGroups.length === 0 ? (
              <div className="text-sm opacity-60">No available groups</div>
            ) : (
              remainingGroups.map((g) => (
                <div
                  key={g.id}
                  className="border rounded p-3 mb-2 flex justify-between items-center"
                >
                  <div>
                    <div className="font-medium">{g.Group_Name}</div>
                    <div className="text-xs opacity-70 truncate">{g.Group_Desc}</div>
                  </div>
                  <button
                    onClick={() => handleJoinGroup(g.id)}
                    className="bg-green-600 text-white px-3 py-1 rounded"
                  >
                    Join
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/*edit grp*/}
      {isEditing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg w-96 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">Edit Group</h3>
              <button onClick={() => setIsEditing(false)}>
                <X />
              </button>
            </div>

            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="Group name"
            />

            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="Group description"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>

              <button
                onClick={async () => {
                  await handleUpdateGroup();
                  setIsEditing(false);
                }}
                className="px-4 py-2 bg-green-600 text-white rounded"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
        {showAgentModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg w-96">
              <div className="flex justify-between mb-4">
                <h3 className="font-bold">Select Agent</h3>
                <button onClick={() => setShowAgentModal(false)}>
                  <X />
                </button>
              </div>

              {agents.length === 0 ? (
                <div className="text-sm opacity-60">No agents available</div>
              ) : (
                agents.map((agent, index) => (
                  <button
                    key={agent.id ?? `agent-${index}`} 
                    onClick={async () => {
                      if (!selectedGroupId) {
                        alert("Please select a group first");
                        return;
                      }

                      try {
                        console.log("Adding agent to group:", agent.id, selectedGroupId, currentUserId);
                        console.log("Received agent_id:", agent.id, "type:", typeof agent.id);
                        await groupAgentService.addAgentToGroup(agent.id, selectedGroupId);

                        alert(`${agent.name} added to the group!`);

                        setActiveAgent(agent);

                        setShowAgentModal(false);


                      } catch (err: any) {
                        console.error("Failed to add agent:", err);
                        alert(err.response?.data?.error || "Failed to add agent to the group.");
                      }
                    }}
                    className={`w-full text-left p-3 rounded mb-2 ${
                      activeAgent?.id === agent.id
                        ? "bg-blue-100 dark:bg-blue-600"
                        : "hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    <div className="font-medium">{agent.name}</div>
                    <div className="text-xs opacity-70">{agent.description}</div>
                  </button>
                ))
              )}
              
            </div>
          </div>
        )}
    </div>
  );
}
