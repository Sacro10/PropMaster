import { TrendingUp, Users, Wrench, DollarSign, CircleCheck, Activity, Bell, ListFilter } from 'lucide-react';
import { useThemeStyles } from '../hooks/useThemeStyles';

export function DashboardOverview() {
  const { isDark, bg, text, border } = useThemeStyles();

  const stats = [
    { label: 'Total Units', value: '127', change: '+12%', trend: 'up', icon: Activity },
    { label: 'Occupied', value: '119', change: '93.7%', trend: 'up', icon: CircleCheck },
    { label: 'Active Tenants', value: '142', change: '+5', trend: 'up', icon: Users },
    { label: 'Monthly Revenue', value: '$284K', change: '+8.2%', trend: 'up', icon: DollarSign },
  ];

  const recentActivity = [
    { type: 'maintenance', title: 'HVAC Filter Delivered', property: 'Sunset Villa #204', time: '12 mins ago', status: 'completed' },
    { type: 'tenant', title: 'New Lease Signed', property: 'Oak Park #15', time: '1 hour ago', status: 'completed' },
    { type: 'showing', title: 'Property Viewing Scheduled', property: 'Downtown Loft #8A', time: '2 hours ago', status: 'pending' },
    { type: 'payment', title: 'Rent Payment Received', property: 'Riverside #302', time: '3 hours ago', status: 'completed' },
    { type: 'maintenance', title: 'Emergency Repair Request', property: 'Maple Street #12', time: '4 hours ago', status: 'urgent' },
  ];

  const upcomingTasks = [
    { task: 'Lease Renewal Review', property: '15 properties', due: 'This week', priority: 'high' },
    { task: 'Monthly HVAC Filter Delivery', property: '89 units', due: 'Jan 15', priority: 'medium' },
    { task: 'Property Inspections', property: '8 properties', due: 'Next week', priority: 'medium' },
    { task: 'Financial Reports Due', property: 'All properties', due: 'Jan 20', priority: 'high' },
  ];

  const quickActions = [
    { label: 'Screen New Tenant', icon: Users, color: 'from-[#ff6b35] to-[#f7931e]' },
    { label: 'Create Maintenance Request', icon: Wrench, color: 'from-[#3b82f6] to-[#8b5cf6]' },
    { label: 'Generate Report', icon: Activity, color: 'from-[#10b981] to-[#06b6d4]' },
    { label: 'Schedule Showing', icon: Bell, color: 'from-[#f59e0b] to-[#ef4444]' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
          PROPERTY OVERVIEW
        </h2>
        <p className={text.muted} style={{ fontFamily: 'Work Sans, sans-serif' }}>
          Real-time insights across all your properties
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6 hover:border-[#ff6b35]/50 transition-all group`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-2 ${isDark ? 'bg-white/5 group-hover:bg-white/10' : 'bg-gray-100 group-hover:bg-gray-200'} rounded-lg transition-colors`}>
                  <Icon className="w-5 h-5 text-[#ff6b35]" />
                </div>
                <span className="text-sm text-emerald-400 flex items-center gap-1" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  <TrendingUp className="w-3 h-3" />
                  {stat.change}
                </span>
              </div>
              <div>
                <p className="text-4xl font-bold mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                  {stat.value}
                </p>
                <p className={`text-sm ${text.muted}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  {stat.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className={`col-span-2 ${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              RECENT ACTIVITY
            </h3>
            <button className={`text-sm ${text.muted} ${text.primary} flex items-center gap-2`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
              <ListFilter className="w-4 h-4" />
              Filter
            </button>
          </div>

          <div className="space-y-3">
            {recentActivity.map((activity, index) => (
              <div
                key={index}
                className={`flex items-center justify-between p-4 ${isDark ? 'bg-white/5 hover:bg-white/10 border-transparent hover:border-white/10' : 'bg-gray-50 hover:bg-gray-100 border-gray-200 hover:border-gray-300'} rounded-lg transition-colors border`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-2 h-2 rounded-full ${
                    activity.status === 'completed' ? 'bg-emerald-400' :
                    activity.status === 'urgent' ? 'bg-red-400' :
                    'bg-amber-400'
                  }`} />
                  <div>
                    <p className="font-medium mb-1" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {activity.title}
                    </p>
                    <p className={`text-sm ${text.muted}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {activity.property}
                    </p>
                  </div>
                </div>
                <span className={`text-sm ${text.inactive}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  {activity.time}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-6">
          <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
            <h3 className="text-2xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              QUICK ACTIONS
            </h3>
            <div className="space-y-3">
              {quickActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <button
                    key={index}
                    className={`w-full flex items-center gap-3 p-4 ${isDark ? 'bg-white/5 hover:bg-white/10 border-transparent hover:border-white/10' : 'bg-gray-50 hover:bg-gray-100 border-gray-200 hover:border-gray-300'} rounded-lg transition-all group border`}
                  >
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${action.color} group-hover:scale-110 transition-transform`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-sm font-medium" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {action.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* System Status */}
          <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
            <h3 className="text-2xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              SYSTEM STATUS
            </h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className={`text-sm ${text.secondary}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>24/7 Support</span>
                  <span className="text-emerald-400 text-sm font-medium">ACTIVE</span>
                </div>
                <div className={`h-1 ${isDark ? 'bg-white/10' : 'bg-gray-200'} rounded-full overflow-hidden`}>
                  <div className="h-full w-full bg-gradient-to-r from-emerald-400 to-emerald-500" />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className={`text-sm ${text.secondary}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>Avg. Lease Time</span>
                  <span className="text-emerald-400 text-sm font-medium">23 DAYS</span>
                </div>
                <div className={`h-1 ${isDark ? 'bg-white/10' : 'bg-gray-200'} rounded-full overflow-hidden`}>
                  <div className="h-full w-[92%] bg-gradient-to-r from-[#ff6b35] to-[#f7931e]" />
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className={`text-sm ${text.secondary}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>Eviction Rate</span>
                  <span className="text-emerald-400 text-sm font-medium">&lt;1%</span>
                </div>
                <div className={`h-1 ${isDark ? 'bg-white/10' : 'bg-gray-200'} rounded-full overflow-hidden`}>
                  <div className="h-full w-[2%] bg-gradient-to-r from-emerald-400 to-emerald-500" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Tasks */}
      <div className={`${isDark ? 'bg-gradient-to-br from-[#1a1f35] to-[#0f1523]' : 'bg-white shadow-md'} border ${border.default} rounded-xl p-6`}>
        <h3 className="text-2xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
          UPCOMING TASKS
        </h3>
        <div className="grid grid-cols-4 gap-4">
          {upcomingTasks.map((task, index) => (
            <div
              key={index}
              className={`p-4 ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg border ${border.default} hover:border-[#ff6b35]/50 transition-all group`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`px-2 py-1 rounded text-xs font-medium ${
                  task.priority === 'high' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {task.priority.toUpperCase()}
                </div>
              </div>
              <p className="font-medium mb-2" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                {task.task}
              </p>
              <p className={`text-sm ${text.muted} mb-2`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                {task.property}
              </p>
              <p className={`text-xs ${text.inactive}`} style={{ fontFamily: 'Work Sans, sans-serif' }}>
                Due: {task.due}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}