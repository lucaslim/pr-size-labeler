// @ts-check
'use strict';

/**
 * PR Size Labeler
 *
 * Native Node.js replacement for the Docker-based implementation.
 * Labels pull requests based on the total number of changed lines,
 * with support for ignoring specific files via regex patterns.
 *
 * @param {{ github: object, context: object, core: object }} tools
 */
module.exports = async function ({ github, context, core }) {
  const xsLabel = process.env.XS_LABEL || 'size/xs';
  const xsMax = Number.parseInt(process.env.XS_MAX_SIZE || '10', 10);
  const sLabel = process.env.S_LABEL || 'size/s';
  const sMax = Number.parseInt(process.env.S_MAX_SIZE || '100', 10);
  const mLabel = process.env.M_LABEL || 'size/m';
  const mMax = Number.parseInt(process.env.M_MAX_SIZE || '500', 10);
  const lLabel = process.env.L_LABEL || 'size/l';
  const lMax = Number.parseInt(process.env.L_MAX_SIZE || '1000', 10);
  const xlLabel = process.env.XL_LABEL || 'size/xl';
  const failIfXl = process.env.FAIL_IF_XL === 'true';
  const messageIfXl = process.env.MESSAGE_IF_XL || '';
  const filesPatterns = process.env.FILES_TO_IGNORE || '';

  const allSizeLabels = [xsLabel, sLabel, mLabel, lLabel, xlLabel];

  /** @type {RegExp[]} */
  const ignorePatterns = filesPatterns
    .split('\n')
    .map((line) => line.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
    .map((pattern) => new RegExp(pattern));

  const { owner, repo } = context.repo;
  const pullNumber = context.payload.pull_request.number;

  // Paginate through all PR files (original was hardcoded to 100 with no pagination)
  const files = await github.paginate(github.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  let totalChanges = 0;

  for (const file of files) {
    if (ignorePatterns.some((pattern) => pattern.test(file.filename))) {
      continue;
    }
    totalChanges += file.additions + file.deletions;
  }

  core.info(`Total changed lines (after exclusions): ${totalChanges}`);

  let sizeLabel;
  if (totalChanges <= xsMax) {
    sizeLabel = xsLabel;
  } else if (totalChanges <= sMax) {
    sizeLabel = sLabel;
  } else if (totalChanges <= mMax) {
    sizeLabel = mLabel;
  } else if (totalChanges <= lMax) {
    sizeLabel = lLabel;
  } else {
    sizeLabel = xlLabel;
  }

  core.info(`Applying label: ${sizeLabel}`);

  // Remove any existing size labels
  const currentLabels = new Set(
    context.payload.pull_request.labels.map((l) => l.name)
  );
  for (const label of allSizeLabels) {
    if (currentLabels.has(label)) {
      await github.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: pullNumber,
        name: label,
      });
    }
  }

  // Add the new size label
  await github.rest.issues.addLabels({
    owner,
    repo,
    issue_number: pullNumber,
    labels: [sizeLabel],
  });

  if (sizeLabel === xlLabel) {
    if (messageIfXl) {
      await github.rest.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body: messageIfXl,
      });
    }

    if (failIfXl) {
      core.setFailed(messageIfXl || `PR exceeds the size limit (${xlLabel})`);
    }
  }
};
