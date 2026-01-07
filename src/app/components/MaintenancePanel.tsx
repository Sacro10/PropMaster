import { Wrench, CircleCheck, Activity, Bell, ListFilter } from 'lucide-react';
import { useHasFeature } from '../hooks/usePlanGating';
import { FeatureGate, LockedFeatureCard } from './UpgradeCTA';

export function MaintenancePanel() {
  // Feature checks for plan gating
  const maintenanceRouting = useHasFeature('maintenance_routing');
  const hvacFilterProgram = useHasFeature('hvac_filter_program');
  const emergencySupport = useHasFeature('emergency_support_24_7');
  const requests = [
    {
      id: '#M-2847',
      title: 'HVAC System Not Cooling',
      property: 'Sunset Villa #204',
      tenant: 'Sarah Johnson',
      priority: 'urgent',
      status: 'assigned',
      submitted: '2 hours ago',
      technician: 'Mike Stevens',
      eta: '1 hour',
    },
    {
      id: '#M-2846',
      title: 'Leaking Faucet in Kitchen',
      property: 'Oak Park #15',
      tenant: 'Michael Chen',
      priority: 'medium',
      status: 'scheduled',
      submitted: '5 hours ago',
      technician: 'Anna Rodriguez',
      eta: 'Tomorrow 9am',
    },
    {
      id: '#M-2845',
      title: 'Broken Window Lock',
      property: 'Downtown Loft #8A',
      tenant: 'Emily Rodriguez',
      priority: 'low',
      status: 'pending',
      submitted: '1 day ago',
      technician: null,
      eta: null,
    },
    {
      id: '#M-2844',
      title: 'Electrical Outlet Not Working',
      property: 'Riverside #302',
      tenant: 'David Williams',
      priority: 'high',
      status: 'in-progress',
      submitted: '3 hours ago',
      technician: 'Tom Jackson',
      eta: 'On site',
    },
    {
      id: '#M-2843',
      title: 'Smoke Detector Beeping',
      property: 'Maple Street #12',
      tenant: 'Jessica Martinez',
      priority: 'medium',
      status: 'completed',
      submitted: '2 days ago',
      technician: 'Mike Stevens',
      eta: null,
    },
  ];

  const hvacProgram = [
    { property: 'Sunset Villa', units: 24, nextDelivery: 'Jan 15', filters: 24, status: 'scheduled' },
    { property: 'Oak Park', units: 18, nextDelivery: 'Jan 18', filters: 18, status: 'scheduled' },
    { property: 'Downtown Lofts', units: 32, nextDelivery: 'Jan 20', filters: 32, status: 'scheduled' },
    { property: 'Riverside', units: 15, nextDelivery: 'Jan 22', filters: 15, status: 'scheduled' },
  ];

  const maintenanceStats = [
    { label: 'Active Requests', value: '12', change: '-15%' },
    { label: 'Avg. Response Time', value: '2.3 hrs', change: '-18%' },
    { label: 'Completion Rate', value: '94%', change: '+3%' },
    { label: 'Emergency Support', value: '24/7', change: 'Active' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl mb-2" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            MAINTENANCE & REMODEL
          </h2>
          <p className="text-white/50" style={{ fontFamily: 'Work Sans, sans-serif' }}>
            Advanced maintenance management with smart routing and 24/7 emergency support
          </p>
        </div>
        <button className="px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg font-medium hover:scale-105 transition-transform">
          + Create Request
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-6">
        {maintenanceStats.map((stat, index) => (
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
        {/* Maintenance Requests */}
        <div className="col-span-2 bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              MAINTENANCE REQUESTS
            </h3>
            <div className="flex items-center gap-3">
              <select className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-[#ff6b35]/50">
                <option>All Priorities</option>
                <option>Urgent</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
              <button className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
                <ListFilter className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {requests.map((request, index) => (
              <div
                key={index}
                className="p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-all border border-transparent hover:border-white/10"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-sm text-white/40" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                        {request.id}
                      </span>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          request.priority === 'urgent'
                            ? 'bg-red-500/20 text-red-400'
                            : request.priority === 'high'
                            ? 'bg-orange-500/20 text-orange-400'
                            : request.priority === 'medium'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}
                      >
                        {request.priority.toUpperCase()}
                      </span>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          request.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : request.status === 'in-progress'
                            ? 'bg-blue-500/20 text-blue-400'
                            : request.status === 'assigned'
                            ? 'bg-purple-500/20 text-purple-400'
                            : request.status === 'scheduled'
                            ? 'bg-cyan-500/20 text-cyan-400'
                            : 'bg-white/20 text-white/60'
                        }`}
                      >
                        {request.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="font-medium mb-2" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {request.title}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-white/50">
                      <span>{request.property}</span>
                      <span>•</span>
                      <span>{request.tenant}</span>
                      <span>•</span>
                      <span>{request.submitted}</span>
                    </div>
                  </div>

                  <div className="text-right ml-4">
                    {request.technician && (
                      <>
                        <p className="text-sm text-white/50 mb-1">Technician</p>
                        <p className="text-sm font-medium mb-1">{request.technician}</p>
                      </>
                    )}
                    {request.eta && (
                      <p className="text-xs text-[#ff6b35]">ETA: {request.eta}</p>
                    )}
                    {!request.technician && (
                      <button className="px-4 py-2 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] rounded-lg text-sm font-medium hover:scale-105 transition-transform">
                        Assign
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button className="w-full mt-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium transition-colors">
            View All Requests
          </button>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* HVAC Filter Program - Gated by Premium (hvac_filter_program) */}
          <FeatureGate
            feature="hvac_filter_program"
            hasAccess={hvacFilterProgram.hasAccess}
            loading={hvacFilterProgram.loading}
            fallback={
              <LockedFeatureCard
                name="HVAC Filter Program"
                description="Automated monthly filter delivery for all your properties"
                icon={<Activity className="w-6 h-6" />}
                feature="hvac_filter_program"
              />
            }
          >
            <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-gradient-to-br from-[#10b981] to-[#06b6d4] rounded-lg">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                HVAC FILTER PROGRAM
              </h3>
            </div>

            <p className="text-sm text-white/70 mb-4" style={{ fontFamily: 'Work Sans, sans-serif' }}>
              Monthly tenant filter delivery program
            </p>

            <div className="space-y-3">
              {hvacProgram.map((property, index) => (
                <div
                  key={index}
                  className="p-3 bg-white/5 rounded-lg border border-white/10"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-sm" style={{ fontFamily: 'Work Sans, sans-serif' }}>
                      {property.property}
                    </p>
                    <span className="text-xs text-white/50">{property.units} units</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/50">Next delivery: {property.nextDelivery}</span>
                    <span className="text-emerald-400">{property.filters} filters</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <p className="text-sm text-emerald-400 mb-1 font-medium">89 filters scheduled</p>
              <p className="text-xs text-white/50">Next batch: January 15, 2026</p>
            </div>
            </div>
          </FeatureGate>

          {/* Emergency Support - Gated by Premium (emergency_support_24_7) */}
          <FeatureGate
            feature="emergency_support_24_7"
            hasAccess={emergencySupport.hasAccess}
            loading={emergencySupport.loading}
            fallback={
              <LockedFeatureCard
                name="24/7 Emergency Support"
                description="Round-the-clock emergency response for urgent maintenance"
                icon={<Bell className="w-6 h-6" />}
                feature="emergency_support_24_7"
              />
            }
          >
            <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-gradient-to-br from-[#ef4444] to-[#dc2626] rounded-lg">
                <Bell className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                24/7 EMERGENCY
              </h3>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-emerald-400 font-medium text-sm">System Active</span>
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                </div>
                <p className="text-xs text-white/70">
                  24/7 emergency support always at your service
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-white mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    &lt;15min
                  </p>
                  <p className="text-xs text-white/50">Response Time</p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-white mb-1" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                    100%
                  </p>
                  <p className="text-xs text-white/50">Coverage</p>
                </div>
              </div>

              <button className="w-full py-3 bg-gradient-to-r from-red-500 to-red-600 rounded-lg font-medium hover:scale-105 transition-transform">
                Emergency Hotline
              </button>
            </div>
            </div>
          </FeatureGate>

          {/* Smart Routing - Gated by Pro (maintenance_routing) */}
          <FeatureGate
            feature="maintenance_routing"
            hasAccess={maintenanceRouting.hasAccess}
            loading={maintenanceRouting.loading}
            fallback={
              <LockedFeatureCard
                name="Smart Routing"
                description="AI-powered technician assignment based on location and expertise"
                icon={<CircleCheck className="w-6 h-6" />}
                feature="maintenance_routing"
              />
            }
          >
            <div className="bg-gradient-to-br from-[#1a1f35] to-[#0f1523] border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <CircleCheck className="w-5 h-5 text-[#ff6b35]" />
              <h3 className="text-xl" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
                SMART ROUTING
              </h3>
            </div>
            <p className="text-sm text-white/70 mb-4">
              AI-powered request routing automatically assigns the best technician based on location, availability, and expertise.
            </p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Routing Efficiency</span>
                <span className="text-emerald-400 font-medium">96%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Auto-Assignment</span>
                <span className="text-emerald-400 font-medium">87%</span>
              </div>
            </div>
            </div>
          </FeatureGate>
        </div>
      </div>
    </div>
  );
}
