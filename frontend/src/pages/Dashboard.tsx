import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Plus, LogOut, Search, Filter, Wand2, MessageSquare, Users, Globe, Inbox, Moon, Sun, HelpCircle } from 'lucide-react';
import api from '../services/api';
import { Agent } from '../types';
import AgentCard from '../components/AgentCard';
import AgentModal from '../components/AgentModal';
import QuickActions from '../components/QuickActions';
import { shareService } from '../services/shareService';
import { useTutorial } from '../context/TutorialContext';

export default function Dashboard() {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
  );

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const { startTutorial } = useTutorial();

  const user = JSON.parse(localStorage.getItem('user') || '{}');

  // Fetch agents
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const response = await api.get('/agents');
      return response.data.data as Agent[];
    },
  });

  // Fetch shared resources
  const { data: sharedResources = [] } = useQuery({
    queryKey: ['sharedResources'],
    queryFn: shareService.getSharedResources,
  });

  // Filter shared resources to only show agents on Dashboard
  const sharedAgents = sharedResources.filter((r: any) => r.resourceType === 'agent');

  // Delete agent mutation
  const deleteAgentMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/agents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this agent?')) {
      deleteAgentMutation.mutate(id);
    }
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setIsModalOpen(true);
  };

  const handleView = (agent: Agent) => {
    navigate(`/agents/${agent.id}`);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingAgent(null);
  };

  const handleFeedback = () => {
    setIsFeedbackOpen(true);
  };


  // Filter agents
  const filteredAgents = agents.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || agent.type === filterType.toUpperCase();
    const matchesStatus = filterStatus === 'all' || agent.status === filterStatus.toUpperCase();
    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Bot className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">AeroIntel</h1>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                  Welcome, {user.name || 'User'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
              {/* Theme toggle */}
              <button
                id="theme-toggle-btn"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                title="Toggle theme"
              >
                {theme === 'light' ? <Moon className="h-4 w-4 text-gray-700 dark:text-gray-200" /> : <Sun className="h-4 w-4 text-gray-700 dark:text-gray-200" />}
              </button>

              {/* Other buttons */}
              <button
                onClick={() => navigate('/search')}
                className="flex items-center justify-center gap-2 border border-green-300 bg-green-50 text-green-700 px-3 sm:px-4 py-2 rounded-lg hover:bg-green-100 transition flex-1 sm:flex-none text-sm"
              >
                <Globe className="h-4 w-4" />
                <span className="hidden sm:inline">Search Public</span>
                <span className="sm:hidden">Search</span>
              </button>
              <button
                onClick={() => navigate('/requests')}
                className="flex items-center justify-center gap-2 border border-orange-300 bg-orange-50 text-orange-700 px-3 sm:px-4 py-2 rounded-lg hover:bg-orange-100 transition flex-1 sm:flex-none text-sm"
              >
                <Inbox className="h-4 w-4" />
                <span className="hidden sm:inline">Requests</span>
                <span className="sm:hidden">Requests</span>
              </button>
              <button
                onClick={() => navigate('/teams')}
                className="flex items-center justify-center gap-2 border border-purple-300 bg-purple-50 dark:bg-purple-600 dark:border-purple-700 text-purple-700 dark:text-purple-100 px-3 sm:px-4 py-2 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-700 transition flex-1 sm:flex-none text-sm"
              >
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Teams</span>
                <span className="sm:hidden">Teams</span>
              </button>
              <button
                id="test-agents-btn"
                onClick={() => navigate('/conversation')}
                className="flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 sm:px-4 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition flex-1 sm:flex-none text-sm"
              >
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">Test Agents</span>
                <span className="sm:hidden">Test</span>
              </button>
              <button
                id="agent-builder-btn"
                onClick={() => navigate('/builder')}
                className="flex items-center justify-center gap-2 bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-blue-700 transition flex-1 sm:flex-none text-sm"
              >
                <Wand2 className="h-4 w-4" />
                Agent Builder
              </button>
              <button
                id="help-btn"
                onClick={startTutorial}
                className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition"
                title="View tutorial"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
              <button
                id="logout-btn"
                onClick={handleLogout}
                className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Actions */}
        <QuickActions
          onNewAgent={() => navigate('/builder')}
          onTestAgent={() => navigate('/conversation')}
          onViewAnalytics={() => navigate('/analytics')}
          onFeedback={() => navigate('/feedback')}
          onProfile={() => navigate('/profile')}
          onCollab={() => navigate('/collab')}

        />

        {/* Search and Filters */}
        <div id="search-filter-section" className="mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center">
          <div className="flex-1 min-w-full sm:min-w-[300px] relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-300" />
            <input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-300"
            />
          </div>

          <div className="flex gap-2 items-center">
            <Filter className="h-4 w-4 text-gray-500 dark:text-gray-300" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="all">All Types</option>
              <option value="conversational">Conversational</option>
              <option value="analytical">Analytical</option>
              <option value="creative">Creative</option>
              <option value="automation">Automation</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="training">Training</option>
            </select>

            <button
              id="new-agent-btn"
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <Plus className="h-4 w-4" />
              Quick Create
            </button>
          </div>
        </div>

        {/* Results Count */}
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Showing {filteredAgents.length} of {agents.length} agents
        </p>

        {/* Agents Grid */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="text-xl text-gray-900 dark:text-gray-100">Loading agents...</div>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="text-center py-12">
            <Bot className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No agents found</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">Get started by creating your first agent</p>
            <button
              onClick={() => navigate('/builder')}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              <Plus className="h-4 w-4" />
              Create Agent
            </button>
          </div>
        ) : (
          <div id="agent-cards-container" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onEdit={handleEdit} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {/* Shared Resources Section */}
        {sharedAgents && sharedAgents.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Users className="h-6 w-6" />
              Shared Agents
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sharedAgents.map((resource) => (
                <div
                  key={`${resource.resourceType}-${resource.resourceId}`}
                  className="bg-white rounded-lg shadow-md p-4 border border-gray-200 hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => {
                    navigate(`/agents/${resource.resourceId}`);
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 line-clamp-1">
                      {resource.resourceName}
                    </h3>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      AGENT
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    Owner: {resource.ownerName}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="px-2 py-1 bg-gray-100 rounded">
                      {resource.role}
                    </span>
                    <span>
                      Shared {new Date(resource.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Agent Modal */}
      {isModalOpen && <AgentModal agent={editingAgent} onClose={handleModalClose} />}
    </div>
  );
}