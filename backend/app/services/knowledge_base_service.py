"""
Knowledge Base Service
Manages service manuals, maintenance records, error codes, and calibration procedures
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime
import json


@dataclass
class KnowledgeEntry:
    """Knowledge base entry"""
    id: str
    title: str
    content: str
    category: str
    device_type: str
    tags: List[str]
    source: str
    confidence: float
    created_at: datetime
    updated_at: datetime


@dataclass
class ServiceManual:
    """Service manual entry"""
    device_type: str
    manufacturer: str
    model: str
    troubleshooting_steps: List[str]
    safety_precautions: List[str]
    error_codes: Dict[str, str]
    calibration_procedures: List[str]
    parts_list: List[str]


@dataclass
class EscalationPath:
    """Escalation path for fault resolution"""
    level: int
    title: str
    required_expertise: str
    estimated_time: str
    actions: List[str]
    contacts: List[str]
    criteria: str


class KnowledgeBaseService:
    """Service for managing knowledge base"""
    
    def __init__(self, include_demo_manuals: bool = False):
        self.knowledge_entries: Dict[str, KnowledgeEntry] = {}
        self.service_manuals: Dict[str, ServiceManual] = {}
        self.escalation_paths: Dict[str, List[EscalationPath]] = {}
        
        # Demo manuals are opt-in and must never enter the production path.
        if include_demo_manuals:
            self._initialize_sample_data()
    
    def _initialize_sample_data(self):
        """Initialize with sample knowledge base data"""
        
        # Sample service manual for ventilator
        ventilator_manual = ServiceManual(
            device_type='VENTILATOR',
            manufacturer='Dräger',
            model='Evita V500',
            troubleshooting_steps=[
                'Check power supply and connections',
                'Verify oxygen supply pressure',
                'Inspect tubing for kinks or leaks',
                'Check alarm settings and thresholds',
                'Verify patient circuit integrity',
                'Review error logs in system menu',
                'Perform self-test from maintenance menu',
            ],
            safety_precautions=[
                'Always have backup ventilation ready',
                'Never disconnect patient from ventilator without manual bag available',
                'Ensure proper oxygen supply before starting',
                'Monitor patient vitals continuously during troubleshooting',
            ],
            error_codes={
                'E001': 'Power supply failure - Check mains and battery',
                'E002': 'Oxygen supply pressure low - Check O2 source',
                'E003': 'Patient circuit leak - Inspect tubing connections',
                'E004': 'Sensor calibration required - Run calibration procedure',
                'E005': 'Expiratory valve failure - Immediate service required',
            },
            calibration_procedures=[
                'Flow sensor calibration using test lung',
                'Pressure transducer zeroing',
                'O2 sensor calibration with known gas mixture',
                'Volume accuracy verification',
            ],
            parts_list=[
                'Expiratory valve assembly',
                'Flow sensor module',
                'O2 sensor',
                'Patient circuit tubing',
                'Battery pack',
            ]
        )
        
        self.service_manuals['VENTILATOR_Dräger_EvitaV500'] = ventilator_manual

        self.service_manuals['VENTILATOR_Hamilton Medical_C6'] = ServiceManual(
            device_type='VENTILATOR', manufacturer='Hamilton Medical', model='C6',
            troubleshooting_steps=[
                'Keep backup ventilation available and assess patient safety',
                'Check mains power, battery status, and oxygen supply',
                'Inspect the patient circuit and tubing for leaks or obstruction',
                'Review alarms and event logs on the ventilator',
                'Run the device self-test or contact biomedical engineering',
            ],
            safety_precautions=[
                'Never disconnect a patient without backup ventilation',
                'Use only approved circuits and sensors',
                'Escalate persistent alarms to biomedical engineering',
            ],
            error_codes={
                'H001': 'Power supply failure - Check mains connection and battery status',
                'H002': 'Oxygen supply pressure low - Verify the oxygen source and regulator',
                'H003': 'Patient circuit leak - Inspect tubing, connections, and humidifier',
                'H004': 'Flow sensor calibration required - Run the approved calibration procedure',
            },
            calibration_procedures=['Flow sensor calibration according to the Hamilton C6 service procedure'],
            parts_list=['Flow sensor', 'Patient circuit', 'Battery pack', 'Oxygen inlet filter'],
        )

        self.service_manuals['PATIENT_MONITOR_Philips_MX800'] = ServiceManual(
            device_type='PATIENT_MONITOR', manufacturer='Philips', model='MX800',
            troubleshooting_steps=[
                'Confirm the monitor is connected to power',
                'Check ECG, SpO2, temperature, and NIBP sensor connections',
                'Inspect cables and accessories for visible damage',
                'Review active alarms and perform the monitor self-test',
                'Contact biomedical engineering if the fault persists',
            ],
            safety_precautions=[
                'Do not rely on monitor readings without clinical assessment',
                'Verify sensor placement before interpreting alarms',
                'Use approved accessories and replacement sensors',
            ],
            error_codes={
                'M001': 'ECG lead off - Check electrode placement and lead connections',
                'M002': 'SpO2 sensor failure - Inspect the sensor, cable, and patient site',
                'M003': 'NIBP cuff leak - Check cuff size, tubing, and connector',
                'M004': 'Display failure - Check power and display connections; escalate if persistent',
            },
            calibration_procedures=['Perform Philips MX800 functional and parameter calibration according to the service procedure'],
            parts_list=['ECG leads', 'SpO2 sensor', 'NIBP cuff', 'Display cable'],
        )

        self.service_manuals['SYRINGE_PUMP_B. Braun_Perfusor Space'] = ServiceManual(
            device_type='SYRINGE_PUMP', manufacturer='B. Braun', model='Perfusor Space',
            troubleshooting_steps=[
                'Stop and assess the infusion according to clinical procedure',
                'Check syringe placement, line routing, clamps, and occlusion',
                'Verify the programmed rate and volume with the clinical order',
                'Check battery and mains power',
                'Escalate repeated alarms to biomedical engineering',
            ],
            safety_precautions=[
                'Do not bypass an occlusion or alarm',
                'Verify medication and rate before restarting infusion',
                'Use only approved syringes and administration sets',
            ],
            error_codes={
                'B001': 'Occlusion detected - Check the line for kinks and closed clamps',
                'B002': 'Battery low - Connect the pump to mains power and replace the battery if needed',
                'B003': 'Syringe not detected - Confirm syringe size, placement, and fixation',
                'B004': 'Infusion stopped - Check alarms, line patency, and programmed settings',
            },
            calibration_procedures=['Perform Perfusor Space flow and occlusion tests according to the service procedure'],
            parts_list=['Battery', 'Syringe holder', 'Drive mechanism', 'Administration set'],
        )
        
        # Sample escalation paths
        self.escalation_paths['EMERGENCY'] = [
            EscalationPath(
                level=1,
                title='Immediate Response',
                required_expertise='NOVICE',
                estimated_time='0-5 minutes',
                actions=[
                    'Ensure patient safety first',
                    'Switch to backup ventilation if available',
                    'Contact on-call specialist immediately',
                    'Document all actions taken',
                ],
                contacts=['On-call Biomedical Engineer: +1234567890'],
                criteria='Life-threatening situation or patient connected to critical device'
            ),
            EscalationPath(
                level=2,
                title='Specialist Intervention',
                required_expertise='EXPERT',
                estimated_time='5-15 minutes',
                actions=[
                    'Specialist arrives on scene',
                    'Advanced troubleshooting',
                    'Device replacement if necessary',
                    'Incident report generation',
                ],
                contacts=['Biomedical Engineering Department', 'Clinical Director'],
                criteria='Specialist on-site or remote guidance available'
            ),
        ]
        
        self.escalation_paths['HIGH'] = [
            EscalationPath(
                level=1,
                title='Urgent Response',
                required_expertise='INTERMEDIATE',
                estimated_time='15-30 minutes',
                actions=[
                    'Review service manual',
                    'Attempt basic troubleshooting',
                ],
                contacts=['Biomedical Engineering Department'],
                criteria='High priority but not immediately life-threatening'
            ),
            EscalationPath(
                level=2,
                title='Specialist Review',
                required_expertise='ADVANCED',
                estimated_time='30-60 minutes',
                actions=[
                    'Specialist review and guidance',
                    'Scheduled maintenance',
                ],
                contacts=['Senior Biomedical Engineer'],
                criteria='Complex issue requiring specialist input'
            ),
        ]
    
    def get_service_manual(self, device_type: str, manufacturer: str = None, model: str = None) -> Optional[ServiceManual]:
        """Get service manual for a device"""
        normalized_type = device_type.upper().replace('-', '_').replace(' ', '_')
        key = f"{normalized_type}_{manufacturer}_{model}" if manufacturer and model else normalized_type
        
        # Try exact match first
        if key in self.service_manuals:
            return self.service_manuals[key]
        
        return None
    
    def get_error_code_meaning(self, device_type: str, error_code: str, manufacturer: str = None, model: str = None) -> Optional[str]:
        """Get meaning of an error code"""
        manual = self.get_service_manual(device_type, manufacturer, model)
        if manual and error_code in manual.error_codes:
            return manual.error_codes[error_code]
        return None
    
    def get_troubleshooting_steps(self, device_type: str, manufacturer: str = None, model: str = None) -> List[str]:
        """Get troubleshooting steps for a device"""
        manual = self.get_service_manual(device_type, manufacturer, model)
        if manual:
            return manual.troubleshooting_steps
        return []
    
    def get_safety_precautions(self, device_type: str, manufacturer: str = None, model: str = None) -> List[str]:
        """Get safety precautions for a device"""
        manual = self.get_service_manual(device_type, manufacturer, model)
        if manual:
            return manual.safety_precautions
        return []
    
    def get_escalation_path(self, severity: str) -> List[EscalationPath]:
        """Get escalation path based on severity"""
        if severity in self.escalation_paths:
            return self.escalation_paths[severity]
        
        # Default escalation for unknown severity
        if severity in ['CRITICAL', 'HIGH']:
            return self.escalation_paths['HIGH']
        
        return []
    
    def add_knowledge_entry(self, entry: KnowledgeEntry):
        """Add a knowledge base entry"""
        self.knowledge_entries[entry.id] = entry
    
    def search_knowledge_base(self, query: str, device_type: str = None) -> List[KnowledgeEntry]:
        """Search knowledge base"""
        results = []
        query_lower = query.lower()
        
        for entry in self.knowledge_entries.values():
            if device_type and entry.device_type != device_type:
                continue
            
            # Search in title, content, and tags
            if (query_lower in entry.title.lower() or
                query_lower in entry.content.lower() or
                any(query_lower in tag.lower() for tag in entry.tags)):
                results.append(entry)
        
        # Sort by confidence
        results.sort(key=lambda x: x.confidence, reverse=True)
        return results
    
    def get_calibration_procedures(self, device_type: str, manufacturer: str = None, model: str = None) -> List[str]:
        """Get calibration procedures for a device"""
        manual = self.get_service_manual(device_type, manufacturer, model)
        if manual:
            return manual.calibration_procedures
        return []
    
    def get_parts_list(self, device_type: str) -> List[str]:
        """Get parts list for a device"""
        manual = self.get_service_manual(device_type)
        if manual:
            return manual.parts_list
        return []
