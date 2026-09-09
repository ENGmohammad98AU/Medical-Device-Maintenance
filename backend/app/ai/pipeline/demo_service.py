"""
Demo AI Service for Decision Support
Provides deterministic synthetic data for demo mode
"""

from typing import Dict, List
from app.schemas.fault_report import AIAnalysisResult, FaultSeverity
from app.models.device import DeviceType


class DemoAIService:
    """Demo AI service with synthetic responses"""
    
    def __init__(self):
        """Initialize demo AI service"""
        self.demo_responses = {
            DeviceType.VENTILATOR: {
                "possible_causes": [
                    "Turbine malfunction or obstruction",
                    "Pressure sensor calibration drift",
                    "Flow sensor contamination",
                    "Oxygen sensor failure",
                    "PEEP valve blockage"
                ],
                "initial_inspection": "Check turbine assembly, inspect pressure and flow sensors, verify oxygen sensor readings, test PEEP valve function",
                "escalation": "Escalate to biomedical engineering if alarm persists after basic troubleshooting"
            },
            DeviceType.PATIENT_MONITOR: {
                "possible_causes": [
                    "ECG lead connection issue",
                    "SpO2 sensor malfunction",
                    "NIBP cuff leak",
                    "IBP transducer calibration",
                    "Temperature probe failure"
                ],
                "initial_inspection": "Verify all sensor connections, replace SpO2 sensor if needed, check NIBP cuff integrity, calibrate IBP transducer",
                "escalation": "Contact biomedical engineering if sensor replacement does not resolve issue"
            },
            DeviceType.SYRINGE_PUMP: {
                "possible_causes": [
                    "Motor malfunction",
                    "Plunger mechanism obstruction",
                    "Battery depletion",
                    "Door sensor failure",
                    "Occlusion sensor calibration"
                ],
                "initial_inspection": "Check battery level, inspect door sensor, test occlusion detection, verify motor function",
                "escalation": "Escalate to biomedical engineering if mechanical issues suspected"
            }
        }
    
    def analyze_fault(self, device: Dict, alarm_code: str, error_message: str, department: str) -> AIAnalysisResult:
        """Analyze fault report and return demo AI analysis"""
        
        device_type = device.get("type", DeviceType.VENTILATOR)
        device_info = self.demo_responses.get(device_type, self.demo_responses[DeviceType.VENTILATOR])
        
        # Determine severity based on error message keywords
        severity = self._determine_severity(error_message, department)
        
        # Generate confidence score
        confidence = self._generate_confidence(severity, department)
        
        # Generate priority
        priority = self._determine_priority(severity, department)
        
        # Generate references (demo)
        references = self._generate_references(device.get("manufacturer", ""), device.get("model", ""))
        
        return AIAnalysisResult(
            device=device.get("name", "Unknown Device"),
            manufacturer=device.get("manufacturer", "Unknown"),
            model=device.get("model", "Unknown"),
            alarm=alarm_code or "Unknown Alarm",
            department=department,
            severity=severity,
            confidence=confidence,
            priority=priority,
            references=references,
            possible_cause=device_info["possible_causes"][0],
            initial_inspection=device_info["initial_inspection"],
            escalation_recommendation=device_info["escalation"],
            is_demo=True
        )
    
    def _determine_severity(self, error_message: str, department: str) -> FaultSeverity:
        """Determine severity based on error message and department"""
        critical_keywords = ["critical", "emergency", "failure", "stop", "fatal", "alarm"]
        high_keywords = ["warning", "high", "major", "severe"]
        
        error_lower = error_message.lower()
        
        if any(keyword in error_lower for keyword in critical_keywords):
            return FaultSeverity.CRITICAL
        elif any(keyword in error_lower for keyword in high_keywords):
            return FaultSeverity.HIGH
        elif department in ["ICU", "CCU", "NICU", "OR"]:
            return FaultSeverity.HIGH
        else:
            return FaultSeverity.MEDIUM
    
    def _generate_confidence(self, severity: FaultSeverity, department: str) -> int:
        """Generate confidence score based on severity and department"""
        base_confidence = 75
        
        if severity == FaultSeverity.CRITICAL:
            base_confidence += 15
        elif severity == FaultSeverity.HIGH:
            base_confidence += 10
        
        if department in ["ICU", "CCU", "NICU", "OR"]:
            base_confidence += 5
        
        return min(base_confidence, 95)
    
    def _determine_priority(self, severity: FaultSeverity, department: str) -> str:
        """Determine priority based on severity and department"""
        if severity == FaultSeverity.CRITICAL:
            return "Urgent"
        elif severity == FaultSeverity.HIGH:
            return "High"
        elif department in ["ICU", "CCU", "NICU", "OR"]:
            return "High"
        else:
            return "Medium"
    
    def _generate_references(self, manufacturer: str, model: str) -> List[str]:
        """Generate demo references"""
        references = [
            f"{manufacturer} {model} Service Manual - Section 4: Troubleshooting",
            f"{manufacturer} Technical Bulletin TB-2024-001",
            "ISO 14971:2019 - Medical device risk management",
            "IEC 60601-1-6: Medical electrical equipment - Risk management"
        ]
        return references
