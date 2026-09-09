"""
Fault Classification Service
Classifies faults based on severity, importance, device type, fault level, and customer expertise
"""

from typing import Dict, Any, Optional
from enum import Enum
from datetime import datetime


class SeverityLevel(str, Enum):
    """Severity levels for faults"""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ImportanceLevel(str, Enum):
    """Importance levels for faults"""
    ROUTINE = "ROUTINE"
    IMPORTANT = "IMPORTANT"
    URGENT = "URGENT"
    EMERGENCY = "EMERGENCY"


class FaultLevel(str, Enum):
    """Fault levels"""
    MINOR = "MINOR"
    MODERATE = "MODERATE"
    MAJOR = "MAJOR"
    SEVERE = "SEVERE"


class ExpertiseLevel(str, Enum):
    """Customer expertise levels"""
    NOVICE = "NOVICE"
    INTERMEDIATE = "INTERMEDIATE"
    ADVANCED = "ADVANCED"
    EXPERT = "EXPERT"


class FaultClassification:
    """Fault classification result"""
    
    def __init__(
        self,
        severity: SeverityLevel,
        importance: ImportanceLevel,
        fault_level: FaultLevel,
        is_emergency: bool,
        requires_specialist: bool,
        recommended_action: str,
        estimated_resolution_time: str,
        safety_impact: str
    ):
        self.severity = severity
        self.importance = importance
        self.fault_level = fault_level
        self.is_emergency = is_emergency
        self.requires_specialist = requires_specialist
        self.recommended_action = recommended_action
        self.estimated_resolution_time = estimated_resolution_time
        self.safety_impact = safety_impact
        self.classified_at = datetime.utcnow()


class FaultClassificationService:
    """Service for classifying medical device faults"""
    
    def __init__(self):
        # Device type severity weights
        self.device_severity_weights = {
            'VENTILATOR': 1.0,
            'PATIENT_MONITOR': 0.9,
            'DEFIBRILLATOR': 1.0,
            'INFUSION_PUMP': 0.8,
            'ECG_MACHINE': 0.7,
            'ULTRASOUND': 0.6,
            'XRAY_MACHINE': 0.7,
            'MRI_MACHINE': 0.8,
            'CT_SCANNER': 0.8,
            'SYRINGE_PUMP': 0.7,
            'GLUCOSE_METER': 0.5,
            'BLOOD_GAS_ANALYZER': 0.7,
            'SPO2_MONITOR': 0.8,
            'BLOOD_PRESSURE_MONITOR': 0.6,
            'ANESTHESIA_MACHINE': 1.0,
            'MEDICAL_GAS_SYSTEM': 0.6,
            'INCUBATOR': 0.9,
            'DIALYSIS_MACHINE': 0.9,
            'LAB_EQUIPMENT': 0.5,
        }
        
        # Emergency keywords
        self.emergency_keywords = [
            'cardiac arrest', 'respiratory failure', 'life support',
            'critical', 'emergency', 'immediate', 'patient safety',
            'vital signs', 'breathing', 'heart rate', 'blood pressure',
            'oxygen', 'ventilation', 'defibrillation', 'cpr'
        ]
        
        # High severity keywords
        self.high_severity_keywords = [
            'failure', 'malfunction', 'not working', 'stopped',
            'error', 'alarm', 'warning', 'critical', 'dangerous'
        ]
        
        # Safety impact keywords
        self.safety_keywords = [
            'patient harm', 'injury', 'death', 'complication',
            'adverse event', 'safety risk', 'hazard'
        ]
    
    def classify_fault(
        self,
        device_type: str,
        error_message: str,
        customer_expertise: str,
        device_location: Optional[str] = None,
        patient_connected: bool = False
    ) -> FaultClassification:
        """
        Classify a fault based on multiple factors
        
        Args:
            device_type: Type of medical device
            error_message: Error description
            customer_expertise: Customer expertise level
            device_location: Location of device (ICU, OR, etc.)
            patient_connected: Whether patient is connected to device
            
        Returns:
            FaultClassification with all classification details
        """
        device_type = device_type.upper().replace('-', '_').replace(' ', '_')

        # Calculate base severity
        base_severity = self._calculate_base_severity(device_type, error_message)
        
        # Adjust for patient connection
        if patient_connected:
            base_severity = self._increase_severity(base_severity)
        
        # Adjust for location
        if device_location in ['ICU', 'CCU', 'NICU', 'OR', 'ER']:
            base_severity = self._increase_severity(base_severity)
        
        # Adjust for customer expertise
        expertise = ExpertiseLevel(customer_expertise.upper())
        if expertise == ExpertiseLevel.NOVICE:
            base_severity = self._increase_severity(base_severity)
        
        # Determine if emergency
        is_emergency = self._is_emergency(error_message, base_severity, patient_connected)
        
        # Determine importance
        importance = self._determine_importance(base_severity, is_emergency, device_location)
        
        # Determine fault level
        fault_level = self._determine_fault_level(base_severity, error_message)
        
        # Determine if specialist required
        requires_specialist = self._requires_specialist(
            device_type, base_severity, expertise, is_emergency
        )
        
        # Generate recommendations
        recommended_action = self._generate_recommendation(
            base_severity, is_emergency, requires_specialist, expertise
        )
        
        # Estimate resolution time
        resolution_time = self._estimate_resolution_time(
            base_severity, requires_specialist, device_type
        )
        
        # Determine safety impact
        safety_impact = self._determine_safety_impact(
            error_message, patient_connected, device_location
        )
        
        return FaultClassification(
            severity=base_severity,
            importance=importance,
            fault_level=fault_level,
            is_emergency=is_emergency,
            requires_specialist=requires_specialist,
            recommended_action=recommended_action,
            estimated_resolution_time=resolution_time,
            safety_impact=safety_impact
        )
    
    def _calculate_base_severity(self, device_type: str, error_message: str) -> SeverityLevel:
        """Calculate base severity from device type and error message"""
        device_weight = self.device_severity_weights.get(device_type, 0.5)
        error_lower = error_message.lower()
        
        # Check for emergency keywords
        if any(keyword in error_lower for keyword in self.emergency_keywords):
            return SeverityLevel.CRITICAL
        
        # Check for high severity keywords
        if any(keyword in error_lower for keyword in self.high_severity_keywords):
            if device_weight >= 0.9:
                return SeverityLevel.CRITICAL
            return SeverityLevel.HIGH
        
        # Calculate based on device weight
        if device_weight >= 0.9:
            return SeverityLevel.HIGH
        elif device_weight >= 0.7:
            return SeverityLevel.MEDIUM
        else:
            return SeverityLevel.LOW
    
    def _increase_severity(self, current: SeverityLevel) -> SeverityLevel:
        """Increase severity by one level"""
        levels = [SeverityLevel.LOW, SeverityLevel.MEDIUM, SeverityLevel.HIGH, SeverityLevel.CRITICAL]
        current_index = levels.index(current)
        if current_index < len(levels) - 1:
            return levels[current_index + 1]
        return current
    
    def _is_emergency(self, error_message: str, severity: SeverityLevel, patient_connected: bool) -> bool:
        """Determine if this is an emergency situation"""
        error_lower = error_message.lower()
        
        # Check emergency keywords
        if any(keyword in error_lower for keyword in self.emergency_keywords):
            return True
        
        # Critical severity with patient connected
        if severity == SeverityLevel.CRITICAL and patient_connected:
            return True
        
        return False
    
    def _determine_importance(
        self,
        severity: SeverityLevel,
        is_emergency: bool,
        location: Optional[str]
    ) -> ImportanceLevel:
        """Determine importance level"""
        if is_emergency:
            return ImportanceLevel.EMERGENCY
        
        if severity == SeverityLevel.CRITICAL:
            return ImportanceLevel.URGENT
        
        if severity == SeverityLevel.HIGH:
            if location in ['ICU', 'CCU', 'NICU', 'OR', 'ER']:
                return ImportanceLevel.URGENT
            return ImportanceLevel.IMPORTANT
        
        if severity == SeverityLevel.MEDIUM:
            return ImportanceLevel.IMPORTANT
        
        return ImportanceLevel.ROUTINE
    
    def _determine_fault_level(self, severity: SeverityLevel, error_message: str) -> FaultLevel:
        """Determine fault level"""
        error_lower = error_message.lower()
        
        if 'complete failure' in error_lower or 'not working' in error_lower:
            return FaultLevel.SEVERE
        
        if severity == SeverityLevel.CRITICAL:
            return FaultLevel.SEVERE
        
        if severity == SeverityLevel.HIGH:
            return FaultLevel.MAJOR
        
        if severity == SeverityLevel.MEDIUM:
            return FaultLevel.MODERATE
        
        return FaultLevel.MINOR
    
    def _requires_specialist(
        self,
        device_type: str,
        severity: SeverityLevel,
        expertise: ExpertiseLevel,
        is_emergency: bool
    ) -> bool:
        """Determine if specialist is required"""
        if is_emergency:
            return True
        
        if severity in [SeverityLevel.CRITICAL, SeverityLevel.HIGH]:
            return True
        
        if expertise in [ExpertiseLevel.NOVICE, ExpertiseLevel.INTERMEDIATE]:
            if severity == SeverityLevel.MEDIUM:
                return True
        
        # Complex devices always require specialist
        if device_type in ['MRI_MACHINE', 'CT_SCANNER', 'VENTILATOR']:
            return True
        
        return False
    
    def _generate_recommendation(
        self,
        severity: SeverityLevel,
        is_emergency: bool,
        requires_specialist: bool,
        expertise: ExpertiseLevel
    ) -> str:
        """Generate recommended action"""
        if is_emergency:
            return "EMERGENCY: Contact on-call specialist immediately. Ensure patient safety first."
        
        if requires_specialist:
            return "Contact biomedical engineering specialist. Do not attempt repairs without proper training."
        
        if severity == SeverityLevel.HIGH:
            return "Schedule urgent maintenance. Follow manufacturer troubleshooting guide."
        
        if severity == SeverityLevel.MEDIUM:
            if expertise == ExpertiseLevel.EXPERT:
                return "Attempt basic troubleshooting following service manual. Log all actions."
            return "Contact support for guidance before attempting any actions."
        
        return "Follow routine troubleshooting procedures. Document all steps taken."
    
    def _estimate_resolution_time(
        self,
        severity: SeverityLevel,
        requires_specialist: bool,
        device_type: str
    ) -> str:
        """Estimate resolution time"""
        if severity == SeverityLevel.CRITICAL:
            return "Immediate - Within 15 minutes"
        
        if requires_specialist:
            if device_type in ['MRI_MACHINE', 'CT_SCANNER']:
                return "2-4 hours (specialist availability dependent)"
            return "1-2 hours"
        
        if severity == SeverityLevel.HIGH:
            return "30-60 minutes"
        
        if severity == SeverityLevel.MEDIUM:
            return "1-2 hours"
        
        return "2-4 hours (routine maintenance)"
    
    def _determine_safety_impact(
        self,
        error_message: str,
        patient_connected: bool,
        location: Optional[str]
    ) -> str:
        """Determine safety impact"""
        error_lower = error_message.lower()
        
        if any(keyword in error_lower for keyword in self.safety_keywords):
            return "HIGH - Potential patient harm"
        
        if patient_connected:
            return "MODERATE - Patient safety at risk"
        
        if location in ['ICU', 'CCU', 'NICU', 'OR', 'ER']:
            return "MODERATE - Critical care environment"
        
        return "LOW - No immediate patient impact"
