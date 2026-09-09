"""
NLP Entity Extractor Service
Extracts important entities from fault reports: device, model, department, error code, etc.
"""

import re
from typing import Dict, List, Optional, Any
from dataclasses import dataclass


@dataclass
class ExtractedEntity:
    """Extracted entity from text"""
    entity_type: str
    value: str
    confidence: float
    start_pos: int
    end_pos: int


class NLPEntityExtractor:
    """Service for extracting entities from fault reports"""
    
    def __init__(self):
        # Device type patterns
        self.device_patterns = {
            'VENTILATOR': r'\b(ventilator|respirator|breathing machine)\b',
            'PATIENT_MONITOR': r'\b(patient monitor|vital signs monitor|multiparameter monitor)\b',
            'DEFIBRILLATOR': r'\b(defibrillator|defib|aed)\b',
            'INFUSION_PUMP': r'\b(infusion pump|iv pump|syringe pump)\b',
            'ECG_MACHINE': r'\b(ecg|ekg|electrocardiogram|heart monitor)\b',
            'ULTRASOUND': r'\b(ultrasound|sonogram|echo)\b',
            'XRAY_MACHINE': r'\b(x-ray|xray|radiography)\b',
            'MRI_MACHINE': r'\b(mri|magnetic resonance)\b',
            'CT_SCANNER': r'\b(ct scanner|cat scan|computed tomography)\b',
            'SYRINGE_PUMP': r'\b(syringe pump|anesthesia pump)\b',
        }
        
        # Error code patterns
        self.error_code_patterns = [
            r'\b[Ee][0-9]{3,4}\b',  # E123, E1234
            r'\b[Ee][Rr][Rr][0-9]{2,4}\b',  # ERR12, ERR123
            r'\b[Ff][0-9]{2,4}\b',  # F12, F123
            r'\b[A-Za-z]{2,4}[0-9]{3,4}\b',  # AB123, XYZ1234
        ]
        
        # Department patterns
        self.department_patterns = {
            'ICU': r'\b(icu|intensive care)\b',
            'CCU': r'\b(ccu|cardiac care)\b',
            'NICU': r'\b(nicu|neonatal intensive)\b',
            'OR': r'\b(or|operating room|theater)\b',
            'ER': r'\b(er|emergency|a&e)\b',
            'Radiology': r'\b(radiology|x-ray)\b',
            'Laboratory': r'\b(lab|laboratory)\b',
            'General Ward': r'\b(ward|general ward)\b',
        }
        
        # Manufacturer patterns
        self.manufacturer_patterns = {
            'Philips': r'\b(philips)\b',
            'GE Healthcare': r'\b(ge healthcare|general electric)\b',
            'Siemens': r'\b(siemens)\b',
            'Dräger': r'\b(dräger|draeger)\b',
            'Medtronic': r'\b(medtronic)\b',
            'Maquet': r'\b(maquet)\b',
            'Mindray': r'\b(mindray)\b',
            'Hamilton Medical': r'\b(hamilton(?: medical)?)\b',
            'B. Braun': r'\b(b\.?\s*braun)\b',
        }
        
        # Model number patterns
        self.model_patterns = [
            r'\b[A-Za-z]{1,3}[-\s]?[0-9]{3,4}\b',  # MX450, IntelliVue MP5
            r'\b[A-Z]{2,4}[0-9]{2,4}[A-Z]?\b',  # MP50, MX800
            r'\bC6\b',
            r'\bPerfusor\s+Space\b',
        ]
        
        # Severity indicators
        self.severity_indicators = {
            'critical': r'\b(critical|emergency|life threatening)\b',
            'high': r'\b(high|urgent|immediate)\b',
            'medium': r'\b(medium|moderate)\b',
            'low': r'\b(low|minor|routine)\b',
        }
    
    def extract_entities(self, text: str) -> Dict[str, List[ExtractedEntity]]:
        """
        Extract all entities from text
        
        Args:
            text: Input text to analyze
            
        Returns:
            Dictionary with entity types as keys and lists of ExtractedEntity as values
        """
        entities = {
            'device_type': [],
            'error_code': [],
            'department': [],
            'manufacturer': [],
            'model': [],
            'severity': [],
        }
        
        # Extract device types
        for device_type, pattern in self.device_patterns.items():
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                entities['device_type'].append(ExtractedEntity(
                    entity_type='device_type',
                    value=device_type,
                    confidence=0.9,
                    start_pos=match.start(),
                    end_pos=match.end()
                ))
        
        # Extract error codes
        for pattern in self.error_code_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                entities['error_code'].append(ExtractedEntity(
                    entity_type='error_code',
                    value=match.group().upper(),
                    confidence=0.95,
                    start_pos=match.start(),
                    end_pos=match.end()
                ))
        
        # Extract departments
        for dept, pattern in self.department_patterns.items():
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                entities['department'].append(ExtractedEntity(
                    entity_type='department',
                    value=dept,
                    confidence=0.85,
                    start_pos=match.start(),
                    end_pos=match.end()
                ))
        
        # Extract manufacturers
        for manufacturer, pattern in self.manufacturer_patterns.items():
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                entities['manufacturer'].append(ExtractedEntity(
                    entity_type='manufacturer',
                    value=manufacturer,
                    confidence=0.8,
                    start_pos=match.start(),
                    end_pos=match.end()
                ))
        
        # Extract model numbers
        for pattern in self.model_patterns:
            matches = re.finditer(pattern, text)
            for match in matches:
                entities['model'].append(ExtractedEntity(
                    entity_type='model',
                    value=match.group(),
                    confidence=0.7,
                    start_pos=match.start(),
                    end_pos=match.end()
                ))
        
        # Extract severity indicators
        for severity, pattern in self.severity_indicators.items():
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                entities['severity'].append(ExtractedEntity(
                    entity_type='severity',
                    value=severity,
                    confidence=0.75,
                    start_pos=match.start(),
                    end_pos=match.end()
                ))
        
        return entities
    
    def get_primary_device_type(self, text: str) -> Optional[str]:
        """Get the primary device type from text"""
        entities = self.extract_entities(text)
        if entities['device_type']:
            return entities['device_type'][0].value
        return None
    
    def get_error_codes(self, text: str) -> List[str]:
        """Get all error codes from text"""
        entities = self.extract_entities(text)
        return [e.value for e in entities['error_code']]
    
    def get_department(self, text: str) -> Optional[str]:
        """Get the department from text"""
        entities = self.extract_entities(text)
        if entities['department']:
            return entities['department'][0].value
        return None
    
    def extract_structured_data(self, text: str) -> Dict[str, Any]:
        """
        Extract structured data from fault report text
        
        Returns:
            Dictionary with structured information
        """
        entities = self.extract_entities(text)
        
        return {
            'device_type': entities['device_type'][0].value if entities['device_type'] else None,
            'error_codes': [e.value for e in entities['error_code']],
            'department': entities['department'][0].value if entities['department'] else None,
            'manufacturer': entities['manufacturer'][0].value if entities['manufacturer'] else None,
            'model': entities['model'][0].value if entities['model'] else None,
            'severity_indicators': [e.value for e in entities['severity']],
            'confidence_scores': {
                entity_type: max([e.confidence for e in entities_list]) if entities_list else 0.0
                for entity_type, entities_list in entities.items()
            }
        }
