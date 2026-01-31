import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users, Plus, Star, Calendar, Target, ChevronRight, Loader, ArrowLeft, FolderKanban } from 'lucide-react';
import { teamService, Team } from '../services/teamService';
import { shareService } from '../services/shareService';

export default function Teams() {
  const navigate = useNavigate();

  const { data: teams = [], isLoading } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: teamService.getTeams,
  });

  // Fetch shared resources and filter for tasks and teams
  const { data: sharedResources = [] } = useQuery({
    queryKey: ['sharedResources'],
    queryFn: shareService.getSharedResources,
  });

  const sharedTasks = sharedResources.filter((r: any) => r.resourceType === 'task');
  const sharedTeams = sharedResources.filter((r: any) => r.resourceType === 'team');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="mb-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                <Users className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Multi-Agent Teams</h1>
                <p className="text-gray-600">Collaborate with multiple agents on complex tasks</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/teams/new')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition"
            >
              <Plus className="h-5 w-5" />
              Create Team
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {teams.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="h-10 w-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">No teams yet</h3>
            <p className="text-gray-600 mb-6">
              Create your first multi-agent team to tackle complex tasks collaboratively
            </p>
            <button
              onClick={() => navigate('/teams/new')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2 transition"
            >
              <Plus className="h-5 w-5" />
              Create Your First Team
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team) => (
              <div
                key={team.id}
                onClick={() => navigate(`/teams/${team.id}`)}
                className="bg-white rounded-lg shadow-sm hover:shadow-md transition cursor-pointer p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
                      <Users className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{team.name}</h3>
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                        {team.status}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </div>

                {team.description && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{team.description}</p>
                )}

                {team.objective && (
                  <div className="flex items-start gap-2 mb-4">
                    <Target className="h-4 w-4 text-blue-600 mt-0.5" />
                    <p className="text-sm text-gray-700 line-clamp-2">{team.objective}</p>
                  </div>
                )}

                {/* Team Members */}
                <div className="mb-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                    Team Members
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {team.members.slice(0, 3).map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-full"
                      >
                        {member.isPrimaryAgent && <Star className="h-3 w-3 text-yellow-500" />}
                        <span className="text-xs font-medium">{member.agent.name}</span>
                      </div>
                    ))}
                    {team.members.length > 3 && (
                      <div className="px-3 py-1 bg-gray-100 rounded-full">
                        <span className="text-xs font-medium text-gray-600">
                          +{team.members.length - 3}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Meta Info */}
                <div className="flex items-center gap-4 text-xs text-gray-500 pt-4 border-t">
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {team.members.length} agents
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(team.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Shared Teams Section */}
        {sharedTeams.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <Users className="h-6 w-6 text-green-600" />
              Shared Teams
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sharedTeams.map((team: any) => (
                <div
                  key={team.resourceId}
                  onClick={() => navigate(`/teams/${team.resourceId}`)}
                  className="bg-white rounded-lg shadow-sm hover:shadow-md transition cursor-pointer p-6 border-l-4 border-green-500"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-lg text-gray-900 line-clamp-1">
                      {team.resourceName}
                    </h3>
                    <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                        SHARED TEAM
                      </span>
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                        {team.role || 'Viewer'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Owner: {team.ownerName}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-gray-500 pt-2 border-t">
                      <Calendar className="h-3 w-3" />
                      Shared {new Date(team.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shared Tasks Section */}
        {sharedTasks.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <FolderKanban className="h-6 w-6 text-blue-600" />
              Shared Tasks
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sharedTasks.map((task: any) => (
                <div
                  key={task.resourceId}
                  onClick={() => {
                    if (task.teamId) {
                      navigate(`/teams/${task.teamId}/tasks/${task.resourceId}`);
                    }
                  }}
                  className="bg-white rounded-lg shadow-sm hover:shadow-md transition cursor-pointer p-6 border-l-4 border-blue-500"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-lg text-gray-900 line-clamp-1">
                      {task.resourceName}
                    </h3>
                    <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                        SHARED TASK
                      </span>
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                        {task.role || 'Viewer'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Owner: {task.ownerName}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-gray-500 pt-2 border-t">
                      <Calendar className="h-3 w-3" />
                      Shared {new Date(task.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
