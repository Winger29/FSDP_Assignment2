import { Plus, MessageSquare, BarChart3, MessageCircle, User } from 'lucide-react';

type Props = {
  onNewAgent: () => void;
  onTestAgent: () => void;
  onViewAnalytics: () => void;
  onFeedback: () => void;
  onProfile: () => void; 
  onCollab: () => void;
};

export default function QuickActions({
  onNewAgent,
  onTestAgent,
  onViewAnalytics,
  onFeedback,
  onProfile, 
  onCollab,
}: Props) {
  const actions = [
    {
      name: 'Create New Agent',
      description: 'Build a custom AI agent for your needs',
      icon: Plus,
      onClick: onNewAgent,
      color: 'bg-blue-600',
    },
    {
      name: 'Test Agents',
      description: 'Try out your agents in conversation',
      icon: MessageSquare,
      onClick: onTestAgent,
      color: 'bg-green-600',
    },
    {
      name: 'View Analytics',
      description: 'Check performance and usage stats',
      icon: BarChart3,
      onClick: onViewAnalytics,
      color: 'bg-purple-600',
    },
    {
      name: 'Give Feedback',
      description: 'Report issues or suggest improvements',
      icon: MessageCircle,
      onClick: onFeedback,
      color: 'bg-orange-600',
    },
    {
      name: 'Profile',
      description: 'View and edit your profile settings',
      icon: User,
      onClick: onProfile,
      color: 'bg-teal-600', // choose a new color so it stands out
    },
        {
      name: 'Collaborate',
      description: 'Work with team members on agents',
      icon: MessageSquare,
      onClick: onCollab,
      color: 'bg-red-600',
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {actions.map((action) => (
        <button
          key={action.name}
          id={`${action.name.toLowerCase().replace(/\s+/g, '-')}-btn`}
          onClick={action.onClick}
          className="flex items-center gap-4 p-5 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-500 transition"
        >
          <div className={`p-3 rounded-lg ${action.color} text-white flex-shrink-0`}>
            <action.icon className="h-6 w-6" />
          </div>
          <div className="text-left">
            <h3 className="font-medium text-gray-900 dark:text-gray-100">
              {action.name}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {action.description}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}