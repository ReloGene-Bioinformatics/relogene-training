#!/usr/bin/env bash
# =============================================================================
# download_testdata.sh — Fetch test data for the bulk RNA-seq Snakemake pipeline
# =============================================================================
#
# Organism  : Saccharomyces cerevisiae (Baker's yeast)
# Why yeast? : Tiny genome (~12 Mb), downloads in minutes, STAR index builds
#              in <5 min, alignment takes seconds — ideal for MacBook testing.
#
# Dataset   : Schurch et al. 2016, "How many biological replicates are needed
#             in an RNA-seq experiment?" (PMID 27022035)
#             ENA study: ERP004763
# Samples   : 3 wild-type replicates  →  ERR458493, ERR458494, ERR458495
#             3 Snf2 KO replicates    →  ERR458496, ERR458497, ERR458498
# Layout    : SINGLE-END, 50 bp reads (~1 M reads/sample, ~50–100 MB each)
#
# Reference : Ensembl Fungi (R64-1-1 / S288C)
#   Genome  : ~3 MB compressed
#   GTF     : ~1 MB compressed
#
# ── IMPORTANT: Set seq_mode in config.yaml ────────────────────────────────────
#   These samples are SINGLE-END. Before running Snakemake, open config.yaml
#   and change:
#       seq_mode: "single"        ← change from "paired" to "single"
#       htseq:
#         stranded: "no"          ← this dataset is unstranded
#       trimmomatic:
#         adapters: "<see note below about adapter path>"
#
# ── Prerequisites ─────────────────────────────────────────────────────────────
#   1. Conda environment activated:
#        conda activate rnaseq_pipeline
#   2. SRA-tools installed (fasterq-dump):
#        conda install -c bioconda sra-tools -y
#   3. curl (pre-installed on macOS)
#
# ── Usage ─────────────────────────────────────────────────────────────────────
#   chmod +x download_testdata.sh
#   ./download_testdata.sh
#
# The script creates this directory layout (matching default config.yaml paths):
#   data/raw/            ← single-end FASTQ files (one per sample)
#   references/          ← genome FASTA + GTF
# =============================================================================

set -euo pipefail   # exit on error, undefined variables, pipe failures

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────

# ENA/SRA accession numbers — 3 WT + 3 Snf2 KO replicates
WT_SAMPLES=(ERR458493 ERR458494 ERR458495)
KO_SAMPLES=(ERR458496 ERR458497 ERR458498)
ALL_SAMPLES=("${WT_SAMPLES[@]}" "${KO_SAMPLES[@]}")

# Output directories (must match config.yaml)
FASTQ_DIR="data/raw"
REF_DIR="references"

# Number of parallel download threads for fasterq-dump
# 4 threads is safe for a MacBook; increase to 8 if you have many cores
THREADS=4

# Ensembl Fungi FTP base URL for S. cerevisiae
# "current" always points to the latest stable release
ENSEMBL_FTP="https://ftp.ensemblgenomes.ebi.ac.uk/pub/current/fungi"

# Expected genome / annotation filenames on Ensembl Fungi FTP
# NOTE: The release number in the GTF filename changes with each Ensembl release.
# If the GTF download fails, visit:
#   https://ftp.ensemblgenomes.ebi.ac.uk/pub/current/fungi/gtf/saccharomyces_cerevisiae/
# and update GTF_GZ below with the current filename.
GENOME_GZ="Saccharomyces_cerevisiae.R64-1-1.dna.toplevel.fa.gz"
GTF_GZ="Saccharomyces_cerevisiae.R64-1-1.gtf.gz"   # release number stripped — resolved below

# ─────────────────────────────────────────────────────────────────────────────
# HELPER: print a timestamped banner
# ─────────────────────────────────────────────────────────────────────────────
banner() {
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo "  $(date '+%H:%M:%S')  $*"
    echo "════════════════════════════════════════════════════════════════"
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 0 — Check prerequisites
# ─────────────────────────────────────────────────────────────────────────────
banner "Checking prerequisites"

for tool in fasterq-dump curl pigz gzip; do
    if command -v "$tool" &>/dev/null; then
        echo "  ✓ $tool found: $(command -v $tool)"
    else
        if [ "$tool" = "pigz" ]; then
            echo "  ℹ  pigz not found — will use gzip instead (slower)"
        else
            echo "  ✗ $tool NOT found. Install with: conda install -c bioconda sra-tools"
            exit 1
        fi
    fi
done

# Choose compressor (pigz is a parallel gzip, much faster on multi-core Macs)
COMPRESS_CMD=$(command -v pigz 2>/dev/null || command -v gzip)
echo "  Compressor: $COMPRESS_CMD"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Create directory structure
# ─────────────────────────────────────────────────────────────────────────────
banner "Creating directory structure"

mkdir -p "$FASTQ_DIR"
mkdir -p "$REF_DIR"
mkdir -p "$REF_DIR/star_index"

echo "  Created: $FASTQ_DIR/"
echo "  Created: $REF_DIR/"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Download FASTQ files from ENA/SRA
# ─────────────────────────────────────────────────────────────────────────────
# fasterq-dump is the modern replacement for fastq-dump. It is:
#   • Multi-threaded (much faster than fastq-dump)
#   • Outputs uncompressed FASTQ by default (we gzip afterwards)
#   • Can access ENA accessions directly (ERR prefix)
#
# For single-end data, fasterq-dump writes: <accession>.fastq
# We rename to match the config.yaml convention: {sample}.fastq.gz
# ─────────────────────────────────────────────────────────────────────────────
banner "Downloading FASTQ files (6 samples × ~50–100 MB each)"

for acc in "${ALL_SAMPLES[@]}"; do
    OUTFILE="$FASTQ_DIR/${acc}.fastq.gz"

    if [ -f "$OUTFILE" ]; then
        echo "  ↷ Skipping $acc — $OUTFILE already exists"
        continue
    fi

    echo "  ↓ Downloading $acc ..."

    # fasterq-dump options:
    #   --outdir   : write output files here
    #   --threads  : parallel threads for download + splitting
    #   --temp     : temp directory for scratch (defaults to CWD)
    #   --skip-technical : skip technical reads (barcodes, linkers)
    fasterq-dump \
        --outdir  "$FASTQ_DIR" \
        --threads "$THREADS" \
        --skip-technical \
        --progress \
        "$acc"

    # Compress the FASTQ with pigz/gzip to save disk space
    # fasterq-dump outputs <accession>.fastq for single-end data
    echo "    Compressing ${acc}.fastq → ${acc}.fastq.gz ..."
    $COMPRESS_CMD -f "$FASTQ_DIR/${acc}.fastq"

    echo "  ✓ $acc done → $OUTFILE"
done

echo ""
echo "  FASTQ download complete. Files in $FASTQ_DIR/:"
ls -lh "$FASTQ_DIR/"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Download reference genome (FASTA)
# ─────────────────────────────────────────────────────────────────────────────
# Source: Ensembl Fungi — Saccharomyces cerevisiae R64-1-1 (S288C assembly)
# Genome size: ~12 Mb (compressed: ~3 MB). Downloads in seconds.
# ─────────────────────────────────────────────────────────────────────────────
banner "Downloading reference genome (S. cerevisiae R64-1-1)"

GENOME_URL="${ENSEMBL_FTP}/fasta/saccharomyces_cerevisiae/dna/${GENOME_GZ}"
GENOME_OUT="$REF_DIR/genome.fa"

if [ -f "$GENOME_OUT" ]; then
    echo "  ↷ Genome already exists at $GENOME_OUT — skipping"
else
    echo "  ↓ Downloading from: $GENOME_URL"
    curl -L --progress-bar "$GENOME_URL" -o "$REF_DIR/$GENOME_GZ"
    echo "  Decompressing ..."
    gzip -d "$REF_DIR/$GENOME_GZ"
    # Rename to the canonical name expected by config.yaml
    mv "$REF_DIR/${GENOME_GZ%.gz}" "$GENOME_OUT"
    echo "  ✓ Genome saved: $GENOME_OUT ($(du -sh $GENOME_OUT | cut -f1))"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — Download gene annotation (GTF)
# ─────────────────────────────────────────────────────────────────────────────
# The GTF filename includes the Ensembl release number (e.g., .60.gtf.gz).
# We resolve the exact filename dynamically from the FTP index.
# ─────────────────────────────────────────────────────────────────────────────
banner "Downloading gene annotation GTF"

GTF_BASE_URL="${ENSEMBL_FTP}/gtf/saccharomyces_cerevisiae"
GTF_OUT="$REF_DIR/annotation.gtf"

if [ -f "$GTF_OUT" ]; then
    echo "  ↷ GTF already exists at $GTF_OUT — skipping"
else
    echo "  Resolving current GTF filename from FTP index ..."
    # Fetch the FTP directory listing and extract the GTF filename
    GTF_FILENAME=$(curl -s "$GTF_BASE_URL/" \
        | grep -oE 'Saccharomyces_cerevisiae\.R64-1-1\.[0-9]+\.gtf\.gz' \
        | head -1)

    if [ -z "$GTF_FILENAME" ]; then
        echo "  ✗ Could not resolve GTF filename automatically."
        echo "    Please visit: $GTF_BASE_URL/"
        echo "    Download the .gtf.gz file manually and save as: $GTF_OUT"
        exit 1
    fi

    echo "  Resolved filename: $GTF_FILENAME"
    GTF_URL="$GTF_BASE_URL/$GTF_FILENAME"
    echo "  ↓ Downloading from: $GTF_URL"
    curl -L --progress-bar "$GTF_URL" -o "$REF_DIR/$GTF_FILENAME"
    echo "  Decompressing ..."
    gzip -d "$REF_DIR/$GTF_FILENAME"
    mv "$REF_DIR/${GTF_FILENAME%.gz}" "$GTF_OUT"
    echo "  ✓ GTF saved: $GTF_OUT ($(du -sh $GTF_OUT | cut -f1))"
fi

