# Arizona Observatory Equipment Plans

## User's Vision: ASIAir Controlled Observatory
- **Primary Goal**: Fully automated nightly operations without physical intervention
- **Current Challenge**: Meade LX75 mount requires manual alignment each session
- **Weight Issues**: Current mount at capacity, needs upgrade
- **Location**: Phoenix area - need to research local conditions

## PLAN A: ASIAir Controlled Observatory (Preferred)
### Key Requirements for Full Automation:
1. **Mount Upgrade**: ZWO AM5/AM5N required for unattended operation
   - Harmonic drive eliminates backlash
   - Built-in WiFi for ASIAir connection
   - No manual alignment needed after initial setup
   - 20kg payload capacity vs LX75 limitations

2. **ASIAir Plus Capabilities** (2024/2025 research):
   - **Plan Mode**: Automated start/stop scheduling
   - **Remote Operation**: 300ft+ range with proper networking
   - **Polar Alignment**: Automated routine, no manual intervention
   - **Focus Control**: Works with ZWO EAF focusers
   - **Dew Control**: Built-in heater management
   - **Weather Integration**: Can connect to weather stations

3. **Dome Control Limitations**:
   - ASIAir does NOT directly control dome systems
   - Requires separate ASCOM-compatible dome controller
   - **Automated Solutions Available**:
     - ScopeDome Control System ($1,500-3,000)
     - Astrometric Dome Controllers ($2,000-4,000) 
     - ACE SmartDome for Observa-Dome ($1,000-2,000)
   - **Scheduling**: Can open/close automatically on timers
   - Alternative: Roll-off roof or open observatory design

### What You Can Keep:
- Cameras (if ASI/ZWO compatible)
- Telescopes/optical trains
- Filters (if using ZWO filter wheels)
- Power supplies and basic accessories

### What Needs Replacement:
- **Mount**: Meade LX75 → ZWO AM5N
- **Focuser**: Manual → ZWO EAF
- **Guide system**: If not ZWO compatible
- **Filter wheel**: If not ZWO compatible

## PLAN B: NINA Software (Minimal Equipment Changes)
### Advantages:
- Works with existing Meade LX75 mount
- Supports non-ZWO equipment
- Advanced sequencer capabilities
- Better error recovery than ASIAir
- Custom horizon mapping
- Free software

### Requirements:
- Windows Mini PC (mounted on telescope)
- ASCOM drivers for mount
- Remote desktop access (phone/tablet control)
- Still requires manual polar alignment

### Cost: ~$300-500 for mini PC vs $2000+ for new mount

## PLAN C: Progressive Upgrade Path
### Phase 1: Immediate improvements ($300-800)
- Add Windows Mini PC with NINA
- ZWO EAF focuser for automation
- Better polar alignment tools (SharpCap Pro)

### Phase 2: Mount upgrade ($2000-3000)
- Replace LX75 with AM5N
- Switch to ASIAir Plus system
- Full automation capabilities

### Phase 3: Observatory enhancements ($1000-5000)
- Roll-off roof or dome system
- Weather monitoring
- Remote networking infrastructure

## Research Findings Summary:
- **ASIAir**: Best for all-ZWO setups, limited customization
- **NINA**: More flexible, works with any equipment, steeper learning curve
- **ZWO AM5N**: Essential for true unattended operation
- **Dome Control**: Requires separate system, not ASIAir compatible
- **Community Consensus**: ASIAir for simplicity, NINA for advanced control

## Next Steps Needed:
1. Current equipment inventory
2. Budget range for each plan
3. Timeline preferences
4. Property/location details for observatory setup
