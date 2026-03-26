#!/usr/bin/env python3
"""
JSON to XSD Converter
Converts PSD008 logical model JSON schema to XML Schema Definition (XSD)
"""

import json
from xml.etree.ElementTree import Element, SubElement, ElementTree, tostring
from xml.dom import minidom
from pathlib import Path


def sql_type_to_xsd_type(sql_type: str) -> str:
    """Map SQL types to XSD types"""
    type_mapping = {
        'TEXT': 'xs:string',
        'INTEGER': 'xs:integer',
        'BOOLEAN': 'xs:boolean',
        'DATE': 'xs:date',
    }
    
    # Handle DECIMAL types
    if sql_type.startswith('DECIMAL'):
        return 'xs:decimal'
    
    # Default to string for unmapped types
    return type_mapping.get(sql_type, 'xs:string')


def create_column_element(parent: Element, column: dict) -> None:
    """Create XSD element for a table column"""
    col_element = SubElement(parent, 'xs:element')
    col_element.set('name', column['name'])
    col_element.set('type', sql_type_to_xsd_type(column['sql_type']))
    
    # Set minOccurs based on nullable
    if column['nullable']:
        col_element.set('minOccurs', '0')
    else:
        col_element.set('minOccurs', '1')
    
    col_element.set('maxOccurs', '1')
    
    # Add annotation with description
    if column.get('description'):
        annotation = SubElement(col_element, 'xs:annotation')
        documentation = SubElement(annotation, 'xs:documentation')
        
        # Add all metadata
        doc_text = f"{column['description']}\n"
        if column.get('psd_ref'):
            doc_text += f"PSD Reference: {column['psd_ref']}\n"
        if column.get('source_system'):
            doc_text += f"Source System: {column['source_system']}\n"
        if column.get('pkfk') and column['pkfk'] != 'NAN':
            doc_text += f"Key Type: {column['pkfk']}\n"
        
        documentation.text = doc_text.strip()


def create_table_complex_type(schema: Element, table: dict) -> None:
    """Create XSD complex type for a table"""
    # Create complex type
    complex_type = SubElement(schema, 'xs:complexType')
    complex_type.set('name', f"{table['table_name']}Type")
    
    # Add annotation
    annotation = SubElement(complex_type, 'xs:annotation')
    documentation = SubElement(annotation, 'xs:documentation')
    documentation.text = f"Table: {table['table_name']} (from sheet: {table['sheet_name']})"
    
    # Create sequence for ordered elements
    sequence = SubElement(complex_type, 'xs:sequence')
    
    # Add columns
    for column in table['columns']:
        create_column_element(sequence, column)
    
    # Add primary key constraint if exists
    if table.get('primary_keys'):
        key_element = SubElement(complex_type, 'xs:key')
        key_element.set('name', f"{table['table_name']}_PK")
        
        selector = SubElement(key_element, 'xs:selector')
        selector.set('xpath', '.')
        
        for pk_column in table['primary_keys']:
            field = SubElement(key_element, 'xs:field')
            field.set('xpath', pk_column)


def create_table_element(schema: Element, table: dict) -> None:
    """Create XSD element for a table"""
    table_element = SubElement(schema, 'xs:element')
    table_element.set('name', table['table_name'])
    table_element.set('type', f"{table['table_name']}Type")


def convert_json_to_xsd(json_file_path: str, xsd_file_path: str) -> None:
    """
    Convert JSON schema to XSD format
    
    Args:
        json_file_path: Path to input JSON schema file
        xsd_file_path: Path to output XSD file
    """
    # Read JSON schema
    with open(json_file_path, 'r', encoding='utf-8') as f:
        json_data = json.load(f)
    
    # Create root XSD schema element
    schema = Element('xs:schema')
    schema.set('xmlns:xs', 'http://www.w3.org/2001/XMLSchema')
    schema.set('elementFormDefault', 'qualified')
    schema.set('attributeFormDefault', 'unqualified')
    
    # Add schema annotation
    annotation = SubElement(schema, 'xs:annotation')
    documentation = SubElement(annotation, 'xs:documentation')
    documentation.text = (
        'PSD008 Logical Model Schema\n'
        'Auto-generated from JSON schema definition\n'
        f'Contains {len(json_data["tables"])} tables'
    )
    
    # Create root element for the entire model
    root_element = SubElement(schema, 'xs:element')
    root_element.set('name', 'PSD008_LogicalModel')
    
    root_complex_type = SubElement(root_element, 'xs:complexType')
    root_sequence = SubElement(root_complex_type, 'xs:sequence')
    
    # Process each table
    for table in json_data['tables']:
        # Create complex type for table
        create_table_complex_type(schema, table)
        
        # Add table element to root sequence
        table_ref = SubElement(root_sequence, 'xs:element')
        table_ref.set('name', table['table_name'])
        table_ref.set('type', f"{table['table_name']}Type")
        table_ref.set('minOccurs', '0')
        table_ref.set('maxOccurs', 'unbounded')
    
    # Create ElementTree and write to file with pretty formatting
    tree = ElementTree(schema)
    
    # Convert to string with pretty print
    xml_str = tostring(schema, encoding='unicode')
    dom = minidom.parseString(xml_str)
    pretty_xml = dom.toprettyxml(indent='  ')
    
    # Remove extra blank lines
    lines = [line for line in pretty_xml.split('\n') if line.strip()]
    pretty_xml = '\n'.join(lines)
    
    # Write to file
    with open(xsd_file_path, 'w', encoding='utf-8') as f:
        f.write(pretty_xml)
    
    print(f"✅ XSD schema created successfully: {xsd_file_path}")
    print(f"📊 Converted {len(json_data['tables'])} tables")
    
    # Print statistics
    total_columns = sum(len(table['columns']) for table in json_data['tables'])
    print(f"📋 Total columns: {total_columns}")


def main():
    """Main entry point"""
    # Define file paths
    json_file = Path('converted_model/psd008_logical_model.schema.json')
    xsd_file = Path('converted_model/psd008_logical_model.schema.xsd')
    
    # Check if input file exists
    if not json_file.exists():
        print(f"❌ Error: JSON file not found: {json_file}")
        return 1
    
    # Convert JSON to XSD
    try:
        convert_json_to_xsd(str(json_file), str(xsd_file))
        
        print(f"\n✨ Conversion complete!")
        print(f"📁 Input:  {json_file}")
        print(f"📁 Output: {xsd_file}")
        
        return 0
    except Exception as e:
        print(f"❌ Error during conversion: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    exit(main())
