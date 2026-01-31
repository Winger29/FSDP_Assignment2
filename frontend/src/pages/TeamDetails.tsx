import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Users,
  Star,
  Plus,
  Play,
  Loader,
  Target,
  CheckCircle2,
  Clock,
  AlertCircle,
  Trash2,
  GitBranch,
} from 'lucide-react';
import { teamService, Team, CollaborativeTask } from '../services/teamService';
import FileUpload, { FilePreview } from '../components/FileUpload';
import api from '../services/api';
import VisibilityToggle from '../components/VisibilityToggle';

export default function TeamDetails() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState('MEDIUM');
  const [taskFiles, setTaskFiles] = useState<FilePreview[]>([]);

  // Fetch team details
  const { data: team, isLoading: teamLoading } = useQuery<Team>({
    queryKey: ['team', teamId],
    queryFn: () => teamService.getTeamById(teamId!),
    enabled: !!teamId,
  });

  // Fetch tasks
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<CollaborativeTask[]>({
    queryKey: ['team-tasks', teamId],
    queryFn: () => teamService.getTasks(teamId!),
    enabled: !!teamId,
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: (data: { title: string; description: string; priority: string }) =>
      teamService.createTask(teamId!, data),
    onSuccess: async (response) => {
      console.log('Task created, response:', response);
      
      // Upload files if any were selected
      const taskId = response?.id;
      console.log('Task ID:', taskId, 'Files to upload:', taskFiles.length);
      
      if (taskId && taskFiles.length > 0) {
        console.log('Starting file uploads...');
        for (const filePreview of taskFiles) {
          try {
            const formData = new FormData();
              formData.append('file', filePreview.file);
            const uploadResponse = await api.post(`/uploads/tasks/${taskId}`, formData, {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
            });
            console.log('Upload response:', uploadResponse.data);
          } catch (uploadErr) {
            console.error('Failed to upload file:', filePreview.file.name, uploadErr);
          }
        }
        console.log('All files uploaded');
      }
      
      queryClient.invalidateQueries({ queryKey: ['team-tasks', teamId] });
      setShowTaskModal(false);
      setTaskTitle('');
      setTaskDescription('');
      setTaskPriority('MEDIUM');
      setTaskFiles([]);
    },
  });

  const handleCreateTask = () => {
    if (!taskTitle.trim() || !taskDescription.trim()) {
      alert('Please enter both title and description');
      return;
    }

    createTaskMutation.mutate({
      title: taskTitle,
      description: taskDescription,
      priority: taskPriority,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'text-green-600 bg-green-50';
      case 'IN_PROGRESS':
        return 'text-blue-600 bg-blue-50';
      case 'FAILED':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'IN_PROGRESS':
        return <Loader className="h-4 w-4 animate-spin" />;
      case 'FAILED':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return 'text-red-700 bg-red-100';
      case 'HIGH':
        return 'text-orange-700 bg-orange-100';
      case 'MEDIUM':
        return 'text-yellow-700 bg-yellow-100';
      default:
        return 'text-gray-700 bg-gray-100';
    }
  };

  // Delete team mutation
  const deleteTeamMutation = useMutation({
    mutationFn: () => teamService.deleteTeam(teamId!),
    onSuccess: () => {
      navigate('/dashboard');
    },
    onError: (error) => {
      console.error('Error deleting team:', error);
      alert('Failed to delete team');
    },
  });

  const handleDeleteTeam = () => {
    if (window.confirm('Are you sure you want to delete this team? This will delete all tasks and data associated with it. This action cannot be undone.')) {
      deleteTeamMutation.mutate();
    }
  };

  if (teamLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Team not found</h2>
          <button
            onClick={() => navigate('/teams')}
            className="text-blue-600 hover:underline"
          >
            Back to Teams
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="mb-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </button>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate('/teams')}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
              title="Back to Teams"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3 flex-1">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                <Users className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold">{team.name}</h1>
                {team.description && (
                  <p className="text-sm text-gray-600">{team.description}</p>
                )}
              </div>
              {team.isOwner !== 0 && (
                <VisibilityToggle
                  resourceType="team"
                  resourceId={team.id}
                  currentVisibility={team.visibility || 'private'}
                  onUpdate={(newVisibility) => {
                    queryClient.setQueryData(['team', teamId], (old: Team | undefined) => 
                      old ? { ...old, visibility: newVisibility } : old
                    );
                  }}
                />
              )}
            </div>
          </div>

          {team.objective && (
            <div className="flex items-start gap-2 bg-blue-50 rounded-lg p-4">
              <Target className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-sm text-blue-900">Team Objective</h3>
                <p className="text-sm text-blue-800">{team.objective}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Team Members */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Members ({team.members.length})
              </h2>

              <div className="space-y-3">
                {team.members.map((member) => (
                  <div key={member.id} className="border rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center text-white font-bold">
                        {member.agent.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate">{member.agent.name}</h3>
                          {member.isPrimaryAgent && (
                            <Star className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-1">{member.role}</p>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                          {member.agent.type}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Delete Team Button - Only for owners */}
            {team.isOwner !== 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="font-bold text-lg mb-4 text-red-600 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Danger Zone
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                  Deleting this team will permanently remove all tasks, assignments, and data associated with it.
                </p>
                <button
                  onClick={handleDeleteTeam}
                  disabled={deleteTeamMutation.isPending}
                  className="w-full px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleteTeamMutation.isPending ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin" />
                      Deleting Team...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" />
                      Delete Team
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Collaborative Tasks */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Collaborative Tasks
                </h2>
                <button
                  onClick={() => setShowTaskModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition"
                >
                  <Plus className="h-4 w-4" />
                  New Task
                </button>
              </div>

              {tasksLoading ? (
                <div className="flex justify-center py-12">
                  <Loader className="h-8 w-8 animate-spin text-blue-600" />
                </div>
              ) : tasks.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Target className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="font-semibold mb-2">No tasks yet</h3>
                  <p className="text-gray-600 mb-4">Create a task for the team to work on</p>
                  <button
                    onClick={() => setShowTaskModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Create First Task
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {tasks.map((task) => (
                    <div key={task.id} className="border rounded-lg p-4 hover:border-blue-300 transition">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold">{task.title}</h3>
                            <span
                              className={`px-2 py-0.5 text-xs rounded-full flex items-center gap-1 ${getStatusColor(
                                task.status
                              )}`}
                            >
                              {getStatusIcon(task.status)}
                              {task.status}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-xs rounded-full ${getPriorityColor(
                                task.priority
                              )}`}
                            >
                              {task.priority}
                            </span>
                            {task.versionCount && task.versionCount > 1 && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
                                <GitBranch className="h-3 w-3" />
                                {task.versionCount} versions
                              </span>
                            )}
                            {task.lastSharedUserVersion && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700 flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                Version by {task.lastSharedUserVersion}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mb-3">{task.description}</p>

                          {task.assignments && task.assignments.length > 0 && (
                            <div className="text-xs text-gray-500 mb-2">
                              {task.assignments.filter((a) => a.status === 'COMPLETED').length} /{' '}
                              {task.assignments.length} subtasks completed
                            </div>
                          )}

                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Clock className="h-3 w-3" />
                            {new Date(task.createdAt).toLocaleString()}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          {task.status === 'PENDING' && (
                            <button
                              onClick={() => navigate(`/teams/${teamId}/tasks/${task.id}/execute`)}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 transition text-sm"
                            >
                              <Play className="h-4 w-4" />
                              Execute
                            </button>
                          )}
                          {task.status === 'COMPLETED' && (
                            <button
                              onClick={() => navigate(`/teams/${teamId}/tasks/${task.id}`)}
                              className="px-4 py-2 border rounded-lg hover:bg-gray-50 transition text-sm"
                            >
                              View Results
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
            <h2 className="text-2xl font-bold mb-4">Create Collaborative Task</h2>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Task Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g., Analyze Mission Viability"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Task Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="Describe the task in detail. The AI will automatically break this down into subtasks for each team member."
                  rows={5}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                <select
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Attachments (Optional)
                </label>
                <FileUpload 
                  onFilesSelected={setTaskFiles}
                  maxFiles={5}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Upload documents, images, or files to provide context for the task
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowTaskModal(false);
                  setTaskTitle('');
                  setTaskDescription('');
                  setTaskPriority('MEDIUM');
                  setTaskFiles([]);
                }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTask}
                disabled={createTaskMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition"
              >
                {createTaskMutation.isPending ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
