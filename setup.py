"""
Setup for openalex_indicators_engine
"""
from setuptools import setup, find_packages

setup(
    name='openalex_indicators_engine',
    version='1.0.0',
    description='Motor unificado de cálculo de indicadores cienciométricos, económicos y de ciencia abierta para OpenAlex',
    author='TlachIA Metrics Team',
    packages=find_packages(),
    python_requires='>=3.10',
    install_requires=[
        'pandas>=2.0.0',
        'numpy>=1.24.0',
        'openpyxl>=3.1.0',
        'clickhouse-connect>=0.7.0',
        'python-dotenv>=1.0.0',
        'pyarrow>=14.0.0'
    ]
)
