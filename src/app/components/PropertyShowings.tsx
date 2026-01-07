import { Key, Clock, CircleCheck, Calendar } from 'lucide-react';
import { useHasFeature } from '../hooks/usePlanGating';
import { FeatureGate } from './UpgradeCTA';

export function PropertyShowings() {
  // Feature checks for plan gating - Electronic showings require Premium
  const electronicShowings = useHasFeature('electronic_showings');
  const upcomingShowings = [
    {
      property: 'Downtown Loft #8A',
      time: 'Today, 2:00 PM',
      visitor: 'Amanda Garcia',
      status: 'confirmed',
      accessCode: 'DL8A-2847',
      type: 'self-guided',
    },
    {
      property: 'Oak Park #23',
      time: 'Today, 4:30 PM',
      visitor: 'Robert Thompson',
      status: 'confirmed',
      accessCode: 'OP23-9142',
      type: 'self-guided',
    },
    {
      property: 'Sunset Villa #15',
      time: 'Tomorrow, 10:00 AM',
      visitor: 'Lisa Chen',
      status: 'pending',
      accessCode: 'SV15-3765',
      type: 'self-guided',
    },
    {
      property: 'Riverside #401',
      time: 'Tomorrow, 3:00 PM',
      visitor: 'Mark Johnson',
      status: 'confirmed',
      accessCode: 'RS401-8234',
      type: 'agent-assisted',
    },
  ];

  const availableProperties = [
    {
      name: 'Downtown Loft #8A',
      rent: '$3,200/mo',
      beds: 2,
      baths: 2,
      sqft: 1250,
      available: 'Now',
      views: 47,
      scheduled: 8,
    },
    {
      name: 'Oak Park #23',
      rent: '$2,100/mo',
      beds: 2,
      baths: 1,
      sqft: 950,
      available: 'Feb 1',
      views: 32,
      scheduled: 5,
    },
    {
      name: 'Sunset Villa #15',
      rent: '$2,800/mo',
      beds: 3,
      baths: 2,
      sqft: 1400,
      available: 'Now',
      views: 56,
      scheduled: 12,
    },
    {
      name: 'Riverside #401',
      rent: '$2,400/mo',
      beds: 2,
      baths: 2,
      sqft: 1100,
      available: 'Jan 15',
      views: 28,
      scheduled: 6,
    },
  ];

  const showingStats = [
    { label: 'Scheduled Today', value: '8', change: '+2' },
    { label: 'Total This Week', value: '34', change: '+12%' },
    { label: 'Avg. Response Time', value: '2.4 hrs', change: '-18%' },
    { label: 'Conversion Rate', value: '42%', change: '+5%' },
  ];

  return (
    <FeatureGate
      feature="electronic_showings"
      hasAccess={electronicShowings.hasAccess}
      loading={electronicShowings.loading}
      variant="inline"
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            ELECTRONIC PROPERTY SHOWINGS
          </h2>
          <p className="text-white/50" style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Quick and easy 24/7 online access for property viewings
          </p>
        </div>
        <button className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform">
          + Schedule Showing
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-6">
        {showingStats.map((stat, index) => (
          <div
            key={index}
            className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6"
          >
            <p className="text-sm text-white/50 mb-2" style={{ fontFamily: 'Work Sans, sans-serif' }}>
              {stat.label}
            </p>
            <div className="flex items-end justify-between">
              <p className="text-3xl font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                {stat.value}
              </p>
              <span className="text-sm text-emerald-400">{stat.change}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Upcoming Showings */}
        <div className="col-span-2 bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
          <h3 className="text-2xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            UPCOMING SHOWINGS
          </h3>

          <div className="space-y-4">
            {upcomingShowings.map((showing, index) => (
              <div
                key={index}
                className="p-5 bg-white/5 rounded-lg border border-white/10 hover:border-[#ff6b35]/50 transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-semibold text-lg" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                        {showing.property}
                      </h4>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          showing.status === 'confirmed'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {showing.status.toUpperCase()}
                      </span>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          showing.type === 'self-guided'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-purple-500/20 text-purple-400'
                        }`}
                      >
                        {showing.type === 'self-guided' ? 'SELF-GUIDED' : 'AGENT-ASSISTED'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-white/50">
                      <span className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {showing.time}
                      </span>
                      <span>•</span>
                      <span>Visitor: {showing.visitor}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-[#ff6b35] to-[#f7931e] rounded-lg">
                      <Key className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-xs text-white/50 mb-1">Access Code</p>
                      <p className="font-mono font-semibold text-[#ff6b35]">{showing.accessCode}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors">
                      Send Reminder
                    </button>
                    <button className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors">
                      Details
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* 24/7 Access */}
          <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-gradient-to-br from-[#10b981] to-[#06b6d4] rounded-lg">
                <Key className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                24/7 ACCESS
              </h3>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-emerald-400 font-medium text-sm">System Online</span>
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                </div>
                <p className="text-xs text-white/70">
                  Self-guided showings available 24/7
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <CircleCheck className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm text-white/70">Smart Lock Integration</span>
                </div>
                <div className="flex items-center gap-3">
                  <CircleCheck className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm text-white/70">Automated Access Codes</span>
                </div>
                <div className="flex items-center gap-3">
                  <CircleCheck className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm text-white/70">Instant Scheduling</span>
                </div>
                <div className="flex items-center gap-3">
                  <CircleCheck className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm text-white/70">Real-time Notifications</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
            <h3 className="text-xl mb-4" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              SHOWING METRICS
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/70">Today's Showings</span>
                <span className="text-lg font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>8</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/70">This Week</span>
                <span className="text-lg font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>34</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/70">Conversion Rate</span>
                <span className="text-lg font-bold text-emerald-400" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>42%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/70">Avg. Duration</span>
                <span className="text-lg font-bold" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>28min</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Available Properties */}
      <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
        <h3 className="text-2xl mb-6" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
          AVAILABLE PROPERTIES
        </h3>
        <div className="grid grid-cols-4 gap-4">
          {availableProperties.map((property, index) => (
            <div
              key={index}
              className="p-4 bg-white/5 rounded-lg border border-white/10 hover:border-[#ff6b35]/50 transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <h4 className="font-semibold" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                  {property.name}
                </h4>
              </div>

              <p className="text-xl font-bold text-[#ff6b35] mb-3" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                {property.rent}
              </p>

              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/50">Beds/Baths</span>
                  <span className="font-medium">{property.beds}bd / {property.baths}ba</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/50">Sq Ft</span>
                  <span className="font-medium">{property.sqft}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/50">Available</span>
                  <span className="font-medium text-emerald-400">{property.available}</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 bg-white/5 rounded mb-3">
                <span className="text-xs text-white/50">{property.views} views</span>
                <span className="text-xs text-white/50">{property.scheduled} scheduled</span>
              </div>

              <button className="w-full py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform">
                Schedule Showing
              </button>
            </div>
          ))}
        </div>
      </div>
      </div>
    </FeatureGate>
  );
}
