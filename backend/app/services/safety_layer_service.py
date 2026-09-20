"""
Safety Layer Service
Prevents unauthorized clinical advice and enforces escalation for critical cases
Complies with ISO 14971, IEC 62304, and IMDRF standards
"""

from typing import Dict, List, Optional, Any
from enum import Enum
from dataclasses import dataclass
from app.services.fault_classification_service import SeverityLevel


class SafetyLevel(str, Enum):
    """Safety levels for recommendations"""
    SAFE = "SAFE"
    CAUTION = "CAUTION"
    WARNING = "WARNING"
    DANGEROUS = "DANGEROUS"
    PROHIBITED = "PROHIBITED"


class RecommendationType(str, Enum):
    """Types of recommendations"""
    TECHNICAL = "TECHNICAL"
    OPERATIONAL = "OPERATIONAL"
    CLINICAL = "CLINICAL"
    PATIENT_SAFETY = "PATIENT_SAFETY"


@dataclass
class SafetyCheck:
    """Result of a safety check"""
    is_safe: bool
    safety_level: SafetyLevel
    recommendation_type: RecommendationType
    warning_message: Optional[str]
    requires_clinical_approval: bool
    requires_specialist_escalation: bool
    allowed_actions: List[str]
    prohibited_actions: List[str]


class SafetyLayerService:
    """Service for enforcing safety standards"""
    
    def __init__(self):
        # Clinical advice keywords that require approval
        self.clinical_keywords = [
            'diagnosis', 'treatment', 'medication', 'dosage',
            'clinical decision', 'patient care', 'therapy',
            'medical intervention', 'prognosis', 'prescription'
        ]
        
        # Prohibited actions for non-clinical staff
        self.prohibited_actions_non_clinical = [
            'adjust medication', 'change treatment parameters',
            'modify clinical settings', 'alter patient care plan',
            'make clinical decisions', 'interpret medical data for diagnosis'
        ]
        
        # Actions requiring specialist escalation
        self.specialist_required_actions = [
            'repair life-support equipment',
            'modify device firmware',
            'bypass safety interlocks',
            'calibrate critical sensors',
            'replace safety-critical components'
        ]
        
        # Safety-critical device types
        self.safety_critical_devices = [
            'VENTILATOR', 'DEFIBRILLATOR', 'PATIENT_MONITOR',
            'INFUSION_PUMP', 'SYRINGE_PUMP', 'ANESTHESIA_MACHINE'
        ]
    
    def check_recommendation_safety(
        self,
        recommendation: str,
        user_role: str,
        device_type: str,
        patient_connected: bool = False
    ) -> SafetyCheck:
        """
        Check if a recommendation is safe to provide
        
        Args:
            recommendation: The recommendation text
            user_role: Role of the user (ADMINISTRATOR, BIOMEDICAL_ENGINEER, etc.)
            device_type: Type of medical device
            patient_connected: Whether patient is connected
            
        Returns:
            SafetyCheck with detailed safety information
        """
        recommendation_lower = recommendation.lower()
        
        # Determine recommendation type
        rec_type = self._classify_recommendation_type(recommendation)
        
        # Check for clinical advice
        is_clinical = any(keyword in recommendation_lower for keyword in self.clinical_keywords)
        
        # Check for prohibited actions
        is_prohibited = any(action in recommendation_lower for action in self.prohibited_actions_non_clinical)
        
        # Check if specialist required
        requires_specialist = any(action in recommendation_lower for action in self.specialist_required_actions)
        
        # Determine safety level
        if is_prohibited:
            safety_level = SafetyLevel.PROHIBITED
            is_safe = False
        elif is_clinical and user_role.lower() not in ['doctor', 'nurse']:
            safety_level = SafetyLevel.DANGEROUS
            is_safe = False
        elif requires_specialist:
            safety_level = SafetyLevel.WARNING
            is_safe = True  # But requires escalation
        elif device_type in self.safety_critical_devices and patient_connected:
            safety_level = SafetyLevel.CAUTION
            is_safe = True
        else:
            safety_level = SafetyLevel.SAFE
            is_safe = True
        
        # Generate warning message
        warning_message = self._generate_warning_message(
            is_clinical, is_prohibited, requires_specialist,
            device_type, patient_connected
        )
        
        # Determine allowed actions
        allowed_actions = self._get_allowed_actions(user_role, device_type, safety_level)
        
        # Determine prohibited actions
        prohibited_actions = self._get_prohibited_actions(user_role, safety_level)
        
        return SafetyCheck(
            is_safe=is_safe,
            safety_level=safety_level,
            recommendation_type=rec_type,
            warning_message=warning_message,
            requires_clinical_approval=is_clinical and user_role.lower() not in ['doctor', 'nurse'],
            requires_specialist_escalation=requires_specialist or safety_level in [SafetyLevel.WARNING, SafetyLevel.DANGEROUS],
            allowed_actions=allowed_actions,
            prohibited_actions=prohibited_actions
        )
    
    def _classify_recommendation_type(self, recommendation: str) -> RecommendationType:
        """Classify the type of recommendation"""
        rec_lower = recommendation.lower()
        
        if any(keyword in rec_lower for keyword in self.clinical_keywords):
            return RecommendationType.CLINICAL
        
        if any(keyword in rec_lower for keyword in ['patient safety', 'vital signs', 'monitor']):
            return RecommendationType.PATIENT_SAFETY
        
        if any(keyword in rec_lower for keyword in ['operate', 'use', 'settings', 'parameters']):
            return RecommendationType.OPERATIONAL
        
        return RecommendationType.TECHNICAL
    
    def _generate_warning_message(
        self,
        is_clinical: bool,
        is_prohibited: bool,
        requires_specialist: bool,
        device_type: str,
        patient_connected: bool
    ) -> Optional[str]:
        """Generate appropriate warning message"""
        if is_prohibited:
            return "PROHIBITED: This action requires clinical authorization. Do not proceed without proper approval."
        
        if is_clinical:
            return "WARNING: This recommendation involves clinical advice. Clinical staff approval required."
        
        if requires_specialist:
            return "CAUTION: This action requires specialist intervention. Escalate to biomedical engineering specialist."
        
        if device_type in self.safety_critical_devices and patient_connected:
            return "CAUTION: Patient connected to safety-critical device. Ensure backup equipment available."
        
        return None
    
    def _get_allowed_actions(
        self,
        user_role: str,
        device_type: str,
        safety_level: SafetyLevel
    ) -> List[str]:
        """Get allowed actions based on user role and safety level"""
        allowed = []
        
        if safety_level == SafetyLevel.SAFE:
            allowed = [
                'View troubleshooting guides',
                'Check error codes',
                'Review service manual',
                'Document observations',
                'Contact support'
            ]
        
        if safety_level in [SafetyLevel.SAFE, SafetyLevel.CAUTION]:
            if user_role.lower() in ['biomedical_engineer', 'medical_technician']:
                allowed.extend([
                    'Perform basic troubleshooting',
                    'Check device connections',
                    'Verify power supply',
                    'Review error logs'
                ])
        
        if user_role.lower() == 'biomedical_engineer':
            allowed.extend([
                'Perform calibration procedures',
                'Replace non-critical parts',
                'Update device software'
            ])
        
        if user_role.lower() == 'administrator':
            allowed.extend([
                'View all reports',
                'Manage user access',
                'Review system status'
            ])
        
        return allowed
    
    def _get_prohibited_actions(self, user_role: str, safety_level: SafetyLevel) -> List[str]:
        """Get prohibited actions based on user role and safety level"""
        prohibited = []
        
        if safety_level in [SafetyLevel.DANGEROUS, SafetyLevel.PROHIBITED]:
            prohibited = self.prohibited_actions_non_clinical.copy()
        
        if user_role.lower() not in ['biomedical_engineer']:
            prohibited.extend([
                'Modify device firmware',
                'Bypass safety interlocks',
                'Replace safety-critical components'
            ])
        
        if user_role.lower() not in ['doctor', 'nurse']:
            prohibited.extend([
                'Adjust clinical parameters',
                'Modify treatment settings'
            ])
        
        return prohibited
    
    def enforce_escalation_for_critical(
        self,
        classification: Any,
        safety_check: SafetyCheck
    ) -> Dict[str, Any]:
        """
        Enforce escalation for critical cases with mandatory procedures
        
        Args:
            classification: Fault classification result
            safety_check: Safety check result
            
        Returns:
            Dictionary with escalation decision and required actions
        """
        escalation_required = False
        escalation_level = None
        required_actions = []
        mandatory_procedures = []
        
        # Check if escalation is required based on safety check
        if safety_check.requires_specialist_escalation:
            escalation_required = True
            escalation_level = "SPECIALIST"
            required_actions.append("Immediate specialist consultation required")
            mandatory_procedures.append("Document safety concerns in patient record")
            mandatory_procedures.append("Notify clinical supervisor")
        
        # Check if escalation is required based on classification
        if hasattr(classification, 'is_emergency') and classification.is_emergency:
            escalation_required = True
            escalation_level = "EMERGENCY"
            required_actions.append("Emergency protocol activation")
            required_actions.append("Immediate clinical notification")
            mandatory_procedures.append("Activate emergency response team")
            mandatory_procedures.append("Document emergency in incident log")
            mandatory_procedures.append("Notify hospital administration")
        
        if hasattr(classification, 'requires_specialist') and classification.requires_specialist:
            escalation_required = True
            if escalation_level != "EMERGENCY":
                escalation_level = "SPECIALIST"
            required_actions.append("Specialist consultation required")
            if escalation_level != "EMERGENCY":
                mandatory_procedures.append("Schedule specialist review within 24 hours")
            mandatory_procedures.append("Document specialist findings")
        
        # High-risk mandatory procedures
        if hasattr(classification, 'severity') and classification.severity in [SeverityLevel.HIGH, SeverityLevel.CRITICAL]:
            mandatory_procedures.append("Require engineer signature before proceeding")
            mandatory_procedures.append("Document all troubleshooting steps")
            mandatory_procedures.append("Create incident report if patient was connected")
        
        return {
            'escalation_required': escalation_required,
            'escalation_level': escalation_level,
            'required_actions': required_actions,
            'mandatory_procedures': mandatory_procedures,
            'immediate_action': classification.is_emergency if hasattr(classification, 'is_emergency') else False
        }
    
    def filter_clinical_advice(
        self,
        content: str,
        user_role: str
    ) -> str:
        """
        Filter out clinical advice for non-clinical users
        
        Returns:
            Filtered content with clinical advice removed or flagged
        """
        if user_role.upper() in ['DOCTOR', 'NURSE']:
            return content  # Clinical staff can see all content
        
        content_lower = content.lower()
        
        # Check for clinical keywords
        has_clinical = any(keyword in content_lower for keyword in self.clinical_keywords)
        
        if has_clinical:
            return "[CLINICAL ADVICE REMOVED - Contact clinical staff for this information]"
        
        return content
