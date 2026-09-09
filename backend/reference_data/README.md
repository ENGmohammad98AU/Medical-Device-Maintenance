# Fault Reference Data

Paste the extracted contents of your `Medical_Device_Fault_Reference.xlsx` workbook into the JSON file below.

Preferred file:

`medical_device_fault_reference.json`

This repository already includes an example format in:

`medical_device_fault_reference.example.json`

The import script reads the JSON list of rule records and writes them into the SQLite fallback database used by the project.

Required columns/fields to preserve:

- rule_id
- sheet_name
- device_id
- device_name
- manufacturer
- model
- device_type
- fault_code
- alarm_code
- error_message
- description
- meaning
- severity
- original_alarm_priority
- possible_causes
- immediate_safety_action
- troubleshooting_steps
- recommended_solution
- verification_before_return_to_service
- source
- reference_url
- reference_page
- aliases
- match_confidence
- match_status
