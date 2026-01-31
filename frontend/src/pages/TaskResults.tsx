import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Users,
  Target,
  Loader,
  Calendar,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  GitBranch,
  Plus,
  Play,
  Upload,
  X,
  Trash2,
} from 'lucide-react';
import { teamService, CollaborativeTask } from '../services/teamService';
import api from '../services/api';
import VisibilityToggle from '../components/VisibilityToggle';

export default function TaskResults() {
  const { teamId, taskId } = useParams<{ teamId: string; taskId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<number>(0);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [versionTitle, setVersionTitle] = useState('');
  const [versionDescription, setVersionDescription] = useState('');
  const [versionFiles, setVersionFiles] = useState<File[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionMessage, setExecutionMessage] = useState<string>('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Fetch task details with versions
  const { data: task, isLoading } = useQuery<CollaborativeTask & { versions?: any[] }>({
    queryKey: ['task', teamId, taskId],
    queryFn: async () => {
      const response = await api.get(`/teams/${teamId}/tasks/${taskId}/versions`);
      return response.data.data;
    },
    enabled: !!teamId && !!taskId,
  });

  // Set initial feedback when task loads or changes
  useEffect(() => {
    if (task?.feedback !== undefined) {
      setFeedback(task.feedback);
    }
    if (task && !versionTitle) {
      setVersionTitle(task.title);
      setVersionDescription(task.description);
    }
  }, [task?.id, task?.feedback]); // Re-run when task ID or feedback changes

  // Feedback mutation
  const feedbackMutation = useMutation({
    mutationFn: async (newFeedback: number) => {
      await api.post(`/teams/${teamId}/tasks/${taskId}/feedback`, { feedback: newFeedback });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', teamId, taskId] });
    },
  });

  // Create new version mutation
  const createVersionMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/teams/${teamId}/tasks/${taskId}/new-version`, {
        title: versionTitle,
        description: versionDescription,
      });
      const newTask = response.data.data;

      // Upload files if any
      if (versionFiles.length > 0) {
        for (const file of versionFiles) {
          const formData = new FormData();
          formData.append('file', file);
          await api.post(`/uploads/tasks/${newTask.id}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        }
      }

      return newTask;
    },
    onSuccess: (newTask) => {
      queryClient.invalidateQueries({ queryKey: ['task', teamId, taskId] });
      setShowVersionModal(false);
      setVersionTitle('');
      setVersionDescription('');
      setVersionFiles([]);
      // Navigate to the new version
      navigate(`/teams/${teamId}/tasks/${newTask.id}`);
    },
  });

  const handleFeedback = (value: number) => {
    const newFeedback = feedback === value ? 0 : value;
    setFeedback(newFeedback);
    if (newFeedback !== 0) {
      feedbackMutation.mutate(newFeedback);
    }
  };

  const handleExecute = async () => {
    setIsExecuting(true);
    setExecutionMessage('Starting task execution...');
    
    try {
      await teamService.executeTask(teamId!, taskId!, (event, data) => {
        switch (event) {
          case 'status':
            setExecutionMessage(data.message || 'Processing...');
            break;
          case 'agent_start':
            setExecutionMessage(`${data.agentName || 'Agent'} is working...`);
            break;
          case 'agent_complete':
            setExecutionMessage(`${data.agentName || 'Agent'} completed`);
            break;
          case 'synthesis':
            setExecutionMessage('Synthesizing results...');
            break;
          case 'complete':
            setExecutionMessage('Task completed successfully!');
            setIsExecuting(false);
            // Refresh task data
            queryClient.invalidateQueries({ queryKey: ['task', teamId, taskId] });
            setTimeout(() => {
              setExecutionMessage('');
              // Reload page to show results
              window.location.reload();
            }, 1500);
            break;
          case 'error':
            setExecutionMessage(`Error: ${data.message || 'Execution failed'}`);
            setIsExecuting(false);
            setTimeout(() => setExecutionMessage(''), 3000);
            break;
        }
      });
    } catch (error) {
      console.error('Execution error:', error);
      setExecutionMessage('Failed to execute task');
      setIsExecuting(false);
      setTimeout(() => setExecutionMessage(''), 3000);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setVersionFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setVersionFiles(versionFiles.filter((_, i) => i !== index));
  };

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: () => teamService.deleteTask(teamId!, taskId!),
    onSuccess: () => {
      navigate(`/teams/${teamId}`);
    },
    onError: (error) => {
      console.error('Error deleting task:', error);
      alert('Failed to delete task');
    },
  });

  const handleDeleteTask = () => {
    if (window.confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
      deleteTaskMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Task not found</h2>
          <button
            onClick={() => navigate(`/teams/${teamId}`)}
            className="text-blue-600 hover:underline"
          >
            Back to Team
          </button>
        </div>
      </div>
    );
  }

  const getAgentColor = (agentId: string) => {
    const colors = [
      'from-blue-500 to-purple-500',
      'from-green-500 to-teal-500',
      'from-orange-500 to-red-500',
      'from-pink-500 to-purple-500',
      'from-indigo-500 to-blue-500',
    ];
    const hash = agentId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

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
              onClick={() => navigate(`/teams/${teamId}`)}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
              title="Back to Team"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3 flex-1">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-blue-500 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold">{task.title}</h1>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                    {task.status}
                  </span>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                    {task.priority}
                  </span>
                </div>
              </div>
              {task.isOwner !== 0 && (
                <VisibilityToggle
                  resourceType="task"
                  resourceId={task.id}
                  currentVisibility={task.visibility || 'private'}
                  onUpdate={(newVisibility) => {
                    queryClient.setQueryData(['task', teamId, taskId], (old: CollaborativeTask & { versions?: any[] } | undefined) => 
                      old ? { ...old, visibility: newVisibility } : old
                    );
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Task Details Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Task Details
                </h2>
                {(task as any).versionNumber && (
                  <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    v{(task as any).versionNumber}
                  </span>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 mb-1">Description</h3>
                  <p className="text-sm text-gray-800">{task.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                      Created
                    </h3>
                    <div className="flex items-center gap-1 text-sm">
                      <Calendar className="h-3 w-3 text-gray-400" />
                      {new Date(task.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  {task.completedAt && (
                    <div>
                      <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                        Completed
                      </h3>
                      <div className="flex items-center gap-1 text-sm">
                        <Clock className="h-3 w-3 text-gray-400" />
                        {new Date(task.completedAt).toLocaleDateString()}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 mt-4">
                  {task.status === 'PENDING' && (
                    <div>
                      <button
                        onClick={handleExecute}
                        disabled={isExecuting}
                        className="w-full px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:from-green-600 hover:to-emerald-600 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isExecuting ? (
                          <>
                            <Loader className="h-4 w-4 animate-spin" />
                            Executing...
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4" />
                            Execute Task
                          </>
                        )}
                      </button>
                      {executionMessage && (
                        <p className="text-xs text-center mt-2 text-gray-600">{executionMessage}</p>
                      )}
                    </div>
                  )}
                  {/* Only users with edit access can create versions */}
                  {task.canEdit !== 0 && (
                    <button
                      onClick={() => setShowVersionModal(true)}
                      className="w-full px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg hover:from-purple-600 hover:to-indigo-600 transition flex items-center justify-center gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Create New Version
                    </button>
                  )}
                  {/* Only owners can delete */}
                  {task.isOwner !== 0 && (
                    <button
                      onClick={handleDeleteTask}
                      disabled={deleteTaskMutation.isPending}
                      className="w-full px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deleteTaskMutation.isPending ? (
                        <>
                          <Loader className="h-4 w-4 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4" />
                          Delete Task
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Version History */}
            {task.versions && task.versions.length > 1 && (
              <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <GitBranch className="h-5 w-5" />
                  Version History
                </h2>
                <div className="space-y-2">
                  {task.versions.map((version: any, index: number) => (
                    <button
                      key={`version-${version.id}-${index}`}
                      onClick={() => navigate(`/teams/${teamId}/tasks/${version.id}`)}
                      className={`w-full text-left p-3 rounded-lg transition ${
                        version.id === taskId
                          ? 'bg-purple-50 border-2 border-purple-500'
                          : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">v{version.versionNumber}</span>
                          {version.creatorName && (
                            <span className="text-xs text-gray-500">
                              by {version.creatorName}
                            </span>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            version.status === 'COMPLETED'
                              ? 'bg-green-100 text-green-700'
                              : version.status === 'FAILED'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {version.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600">
                        {new Date(version.createdAt).toLocaleString()}
                      </div>
                      {version.feedback && (
                        <div className="mt-1">
                          {version.feedback === 1 ? (
                            <ThumbsUp className="h-3 w-3 text-green-600" />
                          ) : (
                            <ThumbsDown className="h-3 w-3 text-red-600" />
                          )}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Team Members Who Worked */}
            {task.assignments && task.assignments.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Team Members
                </h2>

                <div className="space-y-3">
                  {task.assignments.map((assignment) => (
                    <div key={assignment.id} className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 bg-gradient-to-br ${getAgentColor(
                          assignment.agentId
                        )} rounded-lg flex items-center justify-center text-white font-bold text-sm`}
                      >
                        {assignment.agentName.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm truncate">
                          {assignment.agentName}
                        </h3>
                        <p className="text-xs text-gray-600">{assignment.role}</p>
                      </div>
                      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Final Result - Redesigned */}
            {task.result && (
              <div className="bg-white rounded-xl shadow-lg border-2 border-green-200 overflow-hidden mb-6">
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                        <Sparkles className="h-6 w-6 text-white" />
                      </div>
                      <h2 className="text-2xl font-bold text-white">Final Result</h2>
                    </div>
                    {/* Only users with edit access can give feedback */}
                    {task.canEdit !== 0 && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleFeedback(1)}
                          className={`p-2 rounded-lg transition-all ${
                            feedback === 1
                              ? 'bg-white text-green-600'
                              : 'bg-white/20 text-white hover:bg-white/30'
                          }`}
                          title="Thumbs Up"
                        >
                          <ThumbsUp className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleFeedback(-1)}
                          className={`p-2 rounded-lg transition-all ${
                            feedback === -1
                              ? 'bg-white text-red-600'
                              : 'bg-white/20 text-white hover:bg-white/30'
                          }`}
                          title="Thumbs Down"
                        >
                          <ThumbsDown className="h-5 w-5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50">
                  <div className="prose prose-lg max-w-none">
                    <p className="whitespace-pre-wrap text-gray-800 leading-relaxed">{task.result}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Agent Contributions - Redesigned */}
            {task.contributions && task.contributions.length > 0 && (
              <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Users className="h-6 w-6" />
                    Agent Contributions
                  </h2>
                  <p className="text-blue-100 text-sm mt-1">See how each agent contributed to the final result</p>
                </div>

                <div className="p-6 space-y-4">
                  {task.contributions.map((contribution, index) => (
                    <div key={contribution.id} className="group">
                      <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg p-5 border border-gray-200 hover:shadow-md transition-all">
                        <div className="flex items-start gap-4 mb-3">
                          <div
                            className={`w-12 h-12 bg-gradient-to-br ${getAgentColor(
                              contribution.agentId
                            )} rounded-xl flex items-center justify-center text-white font-bold shadow-lg`}
                          >
                            {contribution.agentName.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="text-lg font-bold text-gray-900">{contribution.agentName}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                    Agent {index + 1}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {new Date(contribution.createdAt).toLocaleTimeString()}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-right">
                                  <div className="text-xs text-gray-500">Confidence</div>
                                  <div className="text-lg font-bold text-indigo-600">
                                    {(contribution.confidence * 100).toFixed(0)}%
                                  </div>
                                </div>
                                <div className="w-16 h-16 relative">
                                  <svg className="w-full h-full transform -rotate-90">
                                    <circle
                                      cx="32"
                                      cy="32"
                                      r="28"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                      fill="none"
                                      className="text-gray-200"
                                    />
                                    <circle
                                      cx="32"
                                      cy="32"
                                      r="28"
                                      stroke="currentColor"
                                      strokeWidth="4"
                                      fill="none"
                                      strokeDasharray={`${2 * Math.PI * 28}`}
                                      strokeDashoffset={`${
                                        2 * Math.PI * 28 * (1 - contribution.confidence)
                                      }`}
                                      className="text-indigo-500 transition-all"
                                      strokeLinecap="round"
                                    />
                                  </svg>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="ml-16 bg-white rounded-lg p-4 border border-gray-200">
                          <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{contribution.contribution}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Task Assignments Details */}
            {task.assignments && task.assignments.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
                <h2 className="font-bold text-lg mb-4">Task Breakdown</h2>

                <div className="space-y-4">
                  {task.assignments.map((assignment) => (
                    <div key={assignment.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 bg-gradient-to-br ${getAgentColor(
                              assignment.agentId
                            )} rounded-lg flex items-center justify-center text-white font-bold text-xs`}
                          >
                            {assignment.agentName.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="font-semibold">{assignment.agentName}</h3>
                            <p className="text-xs text-gray-600">{assignment.role}</p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                          {assignment.status}
                        </span>
                      </div>

                      <div className="mb-3">
                        <h4 className="text-sm font-semibold text-gray-700 mb-1">Subtask:</h4>
                        <p className="text-sm text-gray-600">{assignment.subtaskDescription}</p>
                      </div>

                      {assignment.result && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-1">Result:</h4>
                          <div className="bg-gray-50 rounded p-3">
                            <p className="text-sm whitespace-pre-wrap">{assignment.result}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create New Version Modal */}
      {showVersionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <GitBranch className="h-6 w-6 text-purple-600" />
              Create New Task Version
            </h2>
            <p className="text-gray-600 mb-6">
              Modify the task details to create a new version. The new version will use the same
              team and agents.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Task Title
                </label>
                <input
                  type="text"
                  value={versionTitle}
                  onChange={(e) => setVersionTitle(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Enter task title"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Task Description
                </label>
                <textarea
                  value={versionDescription}
                  onChange={(e) => setVersionDescription(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent h-32"
                  placeholder="Enter task description"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Attachments (Optional)
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-purple-500 transition">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                    id="version-file-upload"
                  />
                  <label
                    htmlFor="version-file-upload"
                    className="flex flex-col items-center cursor-pointer"
                  >
                    <Upload className="h-8 w-8 text-gray-400 mb-2" />
                    <span className="text-sm text-gray-600">Click to upload files</span>
                    <span className="text-xs text-gray-500 mt-1">Images, PDFs, or documents</span>
                  </label>
                </div>
                {versionFiles.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {versionFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-gray-50 p-2 rounded"
                      >
                        <span className="text-sm text-gray-700 truncate">{file.name}</span>
                        <button
                          onClick={() => removeFile(index)}
                          className="text-red-500 hover:text-red-700 ml-2"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowVersionModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={() => createVersionMutation.mutate()}
                disabled={createVersionMutation.isPending || !versionTitle || !versionDescription}
                className="px-6 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg hover:from-purple-600 hover:to-indigo-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {createVersionMutation.isPending ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Create Version
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
