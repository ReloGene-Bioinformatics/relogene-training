#!/usr/bin/env bash
#
# Yeast RNA-seq: HISAT2 alignment + htseq-count
# Drop-in replacement for the STAR-based pipeline.
#
# Requires: hisat2, samtools, htseq-count (htseq), gunzip
#

set -euo pipefail

# ================================
# CONFIG
# ================================

THREADS=4

FASTQ_DIR="data/raw"
REF_DIR="references"
GENOME_FA="${REF_DIR}/genome.fa"
GTF="${REF_DIR}/annotation.gtf"
HISAT_INDEX_DIR="${REF_DIR}/hisat2_index"
HISAT_INDEX="${HISAT_INDEX_DIR}/genome"   # index basename

OUT_DIR="results"
ALIGN_OUT="${OUT_DIR}/hisat2"
COUNT_OUT="${OUT_DIR}/counts"

SAMPLES=(
  ERR458493
  ERR458494
  ERR458495
  ERR458496
  ERR458497
  ERR458498
)

# ================================
# STEP 1: Create folders
# ================================

mkdir -p "$HISAT_INDEX_DIR"
mkdir -p "$ALIGN_OUT"
mkdir -p "$COUNT_OUT"

# ================================
# STEP 2: Build HISAT2 index
# ================================

echo "Building HISAT2 index..."

if [ -f "${HISAT_INDEX}.1.ht2" ]; then
  echo "Index exists -> skipping"
else
  hisat2-build -p "$THREADS" "$GENOME_FA" "$HISAT_INDEX"
fi

# ================================
# STEP 3: Align reads
# ================================

echo "Running HISAT2 alignment..."

for sample in "${SAMPLES[@]}"; do

  PREFIX="${ALIGN_OUT}/${sample}"
  mkdir -p "$PREFIX"

  BAM="${PREFIX}/Aligned.sortedByCoord.out.bam"
  SUMMARY="${PREFIX}/align_summary.txt"

  if [ -f "$BAM" ]; then
    echo "$sample already aligned -> skipping"
    continue
  fi

  # Decompress .fastq.gz -> .fastq if needed (keep the .gz)
  FASTQ="${FASTQ_DIR}/${sample}.fastq"
  if [ ! -f "$FASTQ" ]; then
    if [ -f "${FASTQ}.gz" ]; then
      echo "  -> decompressing ${FASTQ}.gz"
      gunzip -k "${FASTQ}.gz"
    else
      echo "ERROR: No FASTQ found for $sample at ${FASTQ}[.gz]" >&2
      exit 1
    fi
  fi

  echo "  -> aligning $sample"

  # Single-end alignment, pipe SAM straight into samtools sort -> BAM
  hisat2 \
    -p "$THREADS" \
    -x "$HISAT_INDEX" \
    -U "$FASTQ" \
    --no-unal \
    --summary-file "$SUMMARY" \
    | samtools sort -@ "$THREADS" -o "$BAM" -

  samtools index "$BAM"

done

# ================================
# STEP 4: HTSeq counting
# ================================

echo "Running HTSeq-count..."

for sample in "${SAMPLES[@]}"; do

  BAM="${ALIGN_OUT}/${sample}/Aligned.sortedByCoord.out.bam"
  OUTFILE="${COUNT_OUT}/${sample}.counts.txt"

  if [ -f "$OUTFILE" ]; then
    echo "$sample counts exist -> skipping"
    continue
  fi

  htseq-count \
    -f bam \
    -r pos \
    -s no \
    -t exon \
    -i gene_id \
    "$BAM" \
    "$GTF" \
    > "$OUTFILE"

done

echo ""
echo "DONE: Count files generated in $COUNT_OUT"
echo "     Alignment summaries: $ALIGN_OUT/<sample>/align_summary.txt"
