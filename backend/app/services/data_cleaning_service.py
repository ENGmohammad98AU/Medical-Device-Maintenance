"""
Data Cleaning Service
Removes patient data, corrects spelling errors, standardizes terminology, and detects language
"""

import re
from typing import Dict, List, Optional, Any
from dataclasses import dataclass


@dataclass
class CleanedData:
    """Result of data cleaning process"""
    original_text: str
    cleaned_text: str
    removed_patient_data: List[str]
    corrected_terms: Dict[str, str]
    detected_language: str
    standardized_terminology: Dict[str, str]
    confidence: float


class DataCleaningService:
    """Service for cleaning and preprocessing fault report data"""
    
    def __init__(self):
        # Patient data patterns to remove
        self.patient_data_patterns = [
            r'\bpatient\s+(name|id|number|record|mrn)\s*[:=]\s*\w+',
            r'\b(mr|ms|mrs|dr)\s+[a-z]+\s+[a-z]+',
            r'\b\d{2,3}-\d{2,4}-\d{4}\b',  # Date patterns
            r'\b\d{10}\b',  # Possible phone numbers
            r'\b[a-z]+@[a-z]+\.[a-z]{2,3}\b',  # Email patterns
            r'\b(age|dob|birth)\s*[:=]\s*\d+\b',
        ]
        
        # Common spelling corrections
        self.spelling_corrections = {
            'ventilater': 'ventilator',
            'ventelator': 'ventilator',
            'moniter': 'monitor',
            'defibrilator': 'defibrillator',
            'infusion': 'infusion',
            'infussion': 'infusion',
            'calibration': 'calibration',
            'calibraton': 'calibration',
            'maintainance': 'maintenance',
            'maintanance': 'maintenance',
            'troubleshoot': 'troubleshoot',
            'troubleshootng': 'troubleshooting',
            'malfunction': 'malfunction',
            'malfuncion': 'malfunction',
            'alarm': 'alarm',
            'alaram': 'alarm',
            'oxygen': 'oxygen',
            'oxigen': 'oxygen',
            'pressure': 'pressure',
            'presure': 'pressure',
            'sensor': 'sensor',
            'senser': 'sensor',
            'circuit': 'circuit',
            'circut': 'circuit',
            'leak': 'leak',
            'leakage': 'leakage',
        }
        
        # Terminology standardization
        self.terminology_mapping = {
            'breathing machine': 'ventilator',
            'respirator': 'ventilator',
            'heart monitor': 'patient monitor',
            'vital signs monitor': 'patient monitor',
            'multiparameter monitor': 'patient monitor',
            'iv pump': 'infusion pump',
            'syringe driver': 'syringe pump',
            'ecg': 'ECG machine',
            'ekg': 'ECG machine',
            'xray': 'X-ray machine',
            'x-ray': 'X-ray machine',
            'cat scan': 'CT scanner',
            'mri': 'MRI machine',
            'echo': 'ultrasound',
            'sonogram': 'ultrasound',
            'defib': 'defibrillator',
            'aed': 'defibrillator',
            'blood glucose': 'glucose meter',
            'glucometer': 'glucose meter',
            'blood gas': 'blood gas analyzer',
            'pulse oximeter': 'SpO2 monitor',
            'oximeter': 'SpO2 monitor',
        }
        
        # Language detection patterns
        self.arabic_patterns = [
            r'[\u0600-\u06FF]',  # Arabic characters
            r'\b(جهاز|عطل|خطأ|إنذار|صيانة|فحص)\b',
        ]
        
        self.english_patterns = [
            r'\b(device|fault|error|alarm|maintenance|check)\b',
        ]
    
    def clean_data(self, text: str) -> CleanedData:
        """
        Clean and preprocess fault report data
        
        Args:
            text: Raw input text
            
        Returns:
            CleanedData with all cleaning results
        """
        original_text = text
        cleaned_text = text
        removed_patient_data = []
        corrected_terms = {}
        standardized_terminology = {}
        
        # Step 1: Remove patient data
        cleaned_text, removed_data = self._remove_patient_data(cleaned_text)
        removed_patient_data = removed_data
        
        # Step 2: Correct spelling
        cleaned_text, corrections = self._correct_spelling(cleaned_text)
        corrected_terms = corrections
        
        # Step 3: Standardize terminology
        cleaned_text, terminology = self._standardize_terminology(cleaned_text)
        standardized_terminology = terminology
        
        # Step 4: Detect language
        detected_language = self._detect_language(cleaned_text)
        
        # Calculate confidence
        confidence = self._calculate_confidence(
            removed_patient_data,
            corrected_terms,
            standardized_terminology
        )
        
        return CleanedData(
            original_text=original_text,
            cleaned_text=cleaned_text,
            removed_patient_data=removed_patient_data,
            corrected_terms=corrected_terms,
            detected_language=detected_language,
            standardized_terminology=standardized_terminology,
            confidence=confidence
        )
    
    def _remove_patient_data(self, text: str) -> tuple:
        """Remove patient data from text"""
        removed_data = []
        cleaned_text = text
        
        for pattern in self.patient_data_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                removed_data.append(str(match))
            
            cleaned_text = re.sub(pattern, '[REDACTED]', cleaned_text, flags=re.IGNORECASE)
        
        return cleaned_text, removed_data
    
    def _correct_spelling(self, text: str) -> tuple:
        """Correct common spelling errors without lowercasing model names/codes."""
        corrected = {}
        cleaned_text = text
        for wrong, correct in self.spelling_corrections.items():
            pattern = re.compile(rf"\b{re.escape(wrong)}\b", re.IGNORECASE)
            if pattern.search(cleaned_text):
                corrected[wrong] = correct
                cleaned_text = pattern.sub(correct, cleaned_text)
        return cleaned_text, corrected
    
    def _standardize_terminology(self, text: str) -> tuple:
        """Standardize known terms while preserving unrelated identifiers and case."""
        standardized = {}
        cleaned_text = text
        for non_standard, standard in self.terminology_mapping.items():
            pattern = re.compile(re.escape(non_standard), re.IGNORECASE)
            if pattern.search(cleaned_text):
                standardized[non_standard] = standard
                cleaned_text = pattern.sub(standard, cleaned_text)
        return cleaned_text, standardized
    
    def _detect_language(self, text: str) -> str:
        """Detect language of the text"""
        text_lower = text.lower()
        
        # Check for Arabic
        for pattern in self.arabic_patterns:
            if re.search(pattern, text):
                return 'ARABIC'
        
        # Check for English
        for pattern in self.english_patterns:
            if re.search(pattern, text_lower):
                return 'ENGLISH'
        
        # Default to English if no clear pattern
        return 'ENGLISH'
    
    def _calculate_confidence(
        self,
        removed_data: List[str],
        corrections: Dict[str, str],
        terminology: Dict[str, str]
    ) -> float:
        """Calculate confidence score for cleaning process"""
        base_confidence = 0.9
        
        # Reduce confidence if many corrections were needed
        total_corrections = len(corrections) + len(terminology)
        if total_corrections > 5:
            base_confidence -= 0.1
        elif total_corrections > 2:
            base_confidence -= 0.05
        
        # Increase confidence if patient data was found and removed
        if removed_data:
            base_confidence += 0.05
        
        return min(max(base_confidence, 0.5), 1.0)
    
    def extract_device_type_from_text(self, text: str) -> Optional[str]:
        """Extract device type from cleaned text"""
        text_lower = text.lower()
        
        for non_standard, standard in self.terminology_mapping.items():
            if non_standard in text_lower:
                return standard.upper().replace(' ', '_')
        
        return None
    
    def extract_severity_indicators(self, text: str) -> List[str]:
        """Extract severity indicators from text"""
        text_lower = text.lower()
        severity_keywords = {
            'critical': 'CRITICAL',
            'emergency': 'EMERGENCY',
            'urgent': 'HIGH',
            'high': 'HIGH',
            'medium': 'MEDIUM',
            'low': 'LOW',
            'minor': 'LOW',
        }
        
        found = []
        for keyword, level in severity_keywords.items():
            if keyword in text_lower:
                found.append(level)
        
        return found if found else ['UNKNOWN']
