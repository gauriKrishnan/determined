import dayjs from 'dayjs';
import utcPlugin from 'dayjs/plugin/utc';

import { expect, test } from 'e2e/fixtures/global-fixtures';
import { ExperimentRow } from 'e2e/models/components/F_ExperimentList';
import { ProjectDetails } from 'e2e/models/pages/ProjectDetails';
import { detExecSync, fullPath } from 'e2e/utils/detCLI';
import { safeName } from 'e2e/utils/naming';
import { repeatWithFallback } from 'e2e/utils/polling';
import { V1Project } from 'services/api-ts-sdk';
import { ExperimentBase } from 'types';

dayjs.extend(utcPlugin);

test.describe('Experiment List', () => {
  let projectDetailsPage: ProjectDetails;
  // trial click to wait for the element to be stable won't work here
  const waitTableStable = async () => await projectDetailsPage._page.waitForTimeout(2_000);
  const getCount = async () => {
    const count =
      await projectDetailsPage.f_experimentList.tableActionBar.count.pwLocator.textContent();
    if (count === null) throw new Error('Count is null');
    return parseInt(count);
  };

  test.beforeAll(async ({ backgroundAuthedPage, newWorkspace, newProject }) => {
    const projectDetailsPageSetup = new ProjectDetails(backgroundAuthedPage);
    await projectDetailsPageSetup.gotoProject(newProject.response.project.id);
    await test.step('Create experiments', async () => {
      await expect(
        projectDetailsPageSetup.f_experimentList.tableActionBar.count.pwLocator,
      ).toContainText('experiment');
      Array(4)
        .fill(null)
        .forEach(() => {
          detExecSync(
            `experiment create ${fullPath('examples/tutorials/mnist_pytorch/adaptive.yaml')} --paused --project_id ${newProject.response.project.id}`,
          );
        });

      const experiments: ExperimentBase[] = JSON.parse(
        detExecSync(
          `project list-experiments --json ${newWorkspace.response.workspace.name} ${newProject.response.project.name}`,
        ),
      );
      detExecSync(`experiment kill ${experiments[experiments.length - 1]?.id}`); // Experiments must be in terminal state to archive
      detExecSync(`experiment archive ${experiments[experiments.length - 1]?.id}`);

      await expect(
        projectDetailsPageSetup.f_experimentList.dataGrid.rows.pwLocator,
      ).not.toHaveCount(0, { timeout: 10_000 });
    });
  });

  test.beforeEach(async ({ authedPage, newProject }) => {
    test.slow();
    projectDetailsPage = new ProjectDetails(authedPage);
    const grid = projectDetailsPage.f_experimentList.dataGrid;

    await projectDetailsPage.gotoProject(newProject.response.project.id);
    await expect(projectDetailsPage.f_experimentList.dataGrid.rows.pwLocator).not.toHaveCount(0, {
      timeout: 10_000,
    });
    await test.step('Deselect', async () => {
      try {
        await grid.headRow.selectDropdown.menuItem('select-none').select({ timeout: 1_000 });
      } catch (e) {
        // close the dropdown by clicking elsewhere
        await projectDetailsPage.f_experimentList.tableActionBar.count.pwLocator.click();
      }
    });
    await test.step('Reset Columns', async () => {
      const columnPicker =
        await projectDetailsPage.f_experimentList.tableActionBar.columnPickerMenu.open();
      await waitTableStable();
      await columnPicker.columnPickerTab.reset.pwLocator.click();
      await columnPicker.close();
      await waitTableStable();
    });
    await test.step('Sort Oldest → Newest', async () => {
      // reset
      const sortContent =
        await projectDetailsPage.f_experimentList.tableActionBar.multiSortMenu.open();
      await sortContent.multiSort.reset.pwLocator.click();
      // the menu doesn't close in local automation, but it works with mouse events
      // manually and sometimes on ci. let's just close it manually
      await sortContent.close();
      await sortContent.open();
      // set sort
      const firstRow = sortContent.multiSort.rows.nth(0);
      await firstRow.column.selectMenuOption('Start time');
      await firstRow.order.selectMenuOption('Oldest → Newest');
      await sortContent.close();
      await waitTableStable();
    });
    await test.step('Reset Filters', async () => {
      const tableFilter =
        await projectDetailsPage.f_experimentList.tableActionBar.tableFilter.open();
      await tableFilter.filterForm.clearFilters.pwLocator.click();
      await tableFilter.close();
      await waitTableStable();
    });
    await test.step('Reset Show Archived', async () => {
      const tableFilter =
        await projectDetailsPage.f_experimentList.tableActionBar.tableFilter.open();
      await expect(
        repeatWithFallback(
          async () =>
            await expect(tableFilter.filterForm.showArchived.pwLocator).toHaveAttribute(
              'aria-checked',
              'false',
            ),
          async () => await tableFilter.filterForm.showArchived.pwLocator.click(),
        ),
      ).toPass({ timeout: 30_000 });
      await tableFilter.close();
      await waitTableStable();
    });
    await grid.setColumnHeight();
    await grid.headRow.setColumnDefs();
  });

  test.skip('Column Picker Check and Uncheck', async () => {
    // BUG [ET-287]
    const columnTitle = 'Forked From',
      columnTestid = 'forkedFrom';
    const columnPicker = projectDetailsPage.f_experimentList.tableActionBar.columnPickerMenu;
    const checkbox = columnPicker.columnPickerTab.columns.listItem(columnTestid).checkbox;
    const grid = projectDetailsPage.f_experimentList.dataGrid;

    await test.step('Check', async () => {
      await columnPicker.open();
      await checkbox.pwLocator.check();
      await columnPicker.close();
      await waitTableStable();
      await grid.headRow.setColumnDefs();
      expect(grid.headRow.columnDefs.get(columnTitle)).toBeTruthy();
      await grid.scrollColumnIntoViewByName(columnTitle);
    });

    await test.step('Uncheck', async () => {
      await columnPicker.open();
      await checkbox.pwLocator.uncheck();
      await columnPicker.close();
      await waitTableStable();
      await grid.headRow.setColumnDefs();
      expect(grid.headRow.columnDefs.get(columnTitle)).toBeUndefined();
    });
  });

  test('Column Picker Show All and Hide All', async () => {
    const columnPicker = projectDetailsPage.f_experimentList.tableActionBar.columnPickerMenu;
    const grid = projectDetailsPage.f_experimentList.dataGrid;
    let previousTabs = grid.headRow.columnDefs.size;

    await test.step('General Tab Show All', async () => {
      await columnPicker.open();
      await columnPicker.columnPickerTab.showAll.pwLocator.click();
      await columnPicker.close();
      await waitTableStable();
      await grid.headRow.setColumnDefs();
      expect.soft(previousTabs).toBeLessThan(grid.headRow.columnDefs.size);
      previousTabs = grid.headRow.columnDefs.size;
    });

    await test.step('Hyperparameter Tab Show All', async () => {
      await columnPicker.open();
      await columnPicker.hyperparameterTab.pwLocator.click();
      await columnPicker.columnPickerTab.showAll.pwLocator.click();
      await columnPicker.close();
      await waitTableStable();
      await grid.headRow.setColumnDefs();
      expect.soft(previousTabs).toBeLessThan(grid.headRow.columnDefs.size);
      previousTabs = grid.headRow.columnDefs.size;
    });

    await test.step('General Tab Hide All', async () => {
      await columnPicker.open();
      await columnPicker.generalTab.pwLocator.click();
      await expect.soft(columnPicker.columnPickerTab.showAll.pwLocator).toHaveText('Hide all');
      await columnPicker.columnPickerTab.showAll.pwLocator.click();
      await columnPicker.close();
      await waitTableStable();
      await grid.headRow.setColumnDefs();
      expect.soft(previousTabs).toBeGreaterThan(grid.headRow.columnDefs.size);
      previousTabs = grid.headRow.columnDefs.size;
    });

    await test.step('General Search[ID] and Show All', async () => {
      const columnTitle = 'ID',
        idColumns = 3;
      await columnPicker.open();
      await columnPicker.columnPickerTab.search.pwLocator.fill(columnTitle);
      await columnPicker.columnPickerTab.showAll.pwLocator.click();
      await columnPicker.close();
      await waitTableStable();
      await grid.headRow.setColumnDefs();
      expect.soft(previousTabs + idColumns).toBeLessThanOrEqual(grid.headRow.columnDefs.size);
      expect(grid.headRow.columnDefs.get(columnTitle)).toBeTruthy();
      await grid.scrollColumnIntoViewByName(columnTitle);
    });
  });

  test('Table Filter', async () => {
    const tableFilter = projectDetailsPage.f_experimentList.tableActionBar.tableFilter;
    const totalExperiments = await getCount();

    const filterScenario = async (
      name: string,
      scenario: () => Promise<void>,
      expectedValue: number,
    ) => {
      await test.step(name, async () => {
        await tableFilter.open();
        await scenario();
        // [ET-284] - Sometimes, closing the popover too quickly causes the filter to not apply.
        await waitTableStable();
        await expect.poll(async () => await getCount()).toBe(expectedValue);
        await tableFilter.close();
      });
    };

    const row = projectDetailsPage.f_experimentList.dataGrid.getRowByIndex(0);
    const id = await (await row.getCellByColumnName('ID')).pwLocator.textContent();
    if (id === null) throw new Error('ID is null');

    await filterScenario(
      'Filter With ID',
      async () => {
        await tableFilter.filterForm.filter.filterFields.columnName.selectMenuOption('ID');
        await expect(tableFilter.filterForm.filter.filterFields.operator.pwLocator).toHaveText('=');
        await tableFilter.filterForm.filter.filterFields.operator.selectMenuOption('=');
        await tableFilter.filterForm.filter.filterFields.valueNumber.pwLocator.fill(id);
      },
      1,
    );

    await filterScenario(
      'Filter Against ID',
      async () => {
        await expect(
          tableFilter.filterForm.filter.filterFields.columnName.selectionItem.pwLocator,
        ).toHaveText('ID');
        await tableFilter.filterForm.filter.filterFields.operator.selectMenuOption('!=');
      },
      totalExperiments - 1,
    );

    await filterScenario(
      'Filter OR',
      async () => {
        await tableFilter.filterForm.addCondition.pwLocator.click();
        const secondFilterField = tableFilter.filterForm.filter.filterFields.nth(1);
        const conjunction = secondFilterField.conjunctionContainer.conjunctionSelect;
        await conjunction.pwLocator.click();
        await conjunction._menu.pwLocator.waitFor();
        await conjunction.menuItem('or').pwLocator.click();
        await conjunction._menu.pwLocator.waitFor({ state: 'hidden' });

        const columnName = secondFilterField.columnName;
        await columnName.pwLocator.click();
        await columnName._menu.pwLocator.waitFor();
        await columnName.menuItem('ID').pwLocator.click();
        await columnName._menu.pwLocator.waitFor({ state: 'hidden' });

        const operator = secondFilterField.operator;
        await expect(operator.pwLocator).toHaveText('=');
        await operator.pwLocator.click();
        await operator._menu.pwLocator.waitFor();
        await operator.menuItem('=').pwLocator.click();
        await operator._menu.pwLocator.waitFor({ state: 'hidden' });

        await secondFilterField.valueNumber.pwLocator.fill(id);
      },
      totalExperiments,
    );

    await filterScenario(
      'Show Archived',
      async () => {
        await expect(
          repeatWithFallback(
            async () =>
              await expect(tableFilter.filterForm.showArchived.pwLocator).toHaveAttribute(
                'aria-checked',
                'true',
              ),
            async () => await tableFilter.filterForm.showArchived.pwLocator.click(),
          ),
        ).toPass({ timeout: 30_000 });
      },
      totalExperiments + 1,
    );
  });

  test('Datagrid Functionality Validations', async ({ authedPage }) => {
    const row = projectDetailsPage.f_experimentList.dataGrid.getRowByIndex(0);
    await test.step('Select Row', async () => {
      await row.clickColumn('Select');
      expect.soft(await row.isSelected()).toBeTruthy();
    });
    await test.step('Read Cell Value', async () => {
      await expect.soft((await row.getCellByColumnName('ID')).pwLocator).toHaveText(/\d+/);
    });
    await test.step('Select 5', async () => {
      await (
        await projectDetailsPage.f_experimentList.dataGrid.headRow.selectDropdown.open()
      ).select5.pwLocator.click();
    });
    await test.step('Experiment Overview Navigation', async () => {
      await projectDetailsPage.f_experimentList.dataGrid.scrollLeft();
      const textContent = await (await row.getCellByColumnName('ID')).pwLocator.textContent();
      await row.clickColumn('ID');
      if (textContent === null) throw new Error('Cannot read row id');
      await authedPage.waitForURL(new RegExp(textContent));
    });
  });

  test('Datagrid Actions', async () => {
    const row = projectDetailsPage.f_experimentList.dataGrid.getRowByIndex(0);
    await row.experimentActionDropdown.open();

    // feel free to split actions into their own test cases. this is just a starting point
    await test.step('Edit', async () => {
      const editedValue = safeName('EDITED_EXPERIMENT_NAME');
      await row.experimentActionDropdown.edit.pwLocator.click();
      await row.experimentActionDropdown.editModal.nameInput.pwLocator.fill(editedValue);
      await row.experimentActionDropdown.editModal.footer.submit.pwLocator.click();
      await waitTableStable();
      await expect.soft((await row.getCellByColumnName('Name')).pwLocator).toHaveText(editedValue);
    });
    // await test.step('Stop', async () => {
    //   // what happens if the experiment is already stopped?
    // });
    // await test.step('Kill', async () => {
    //   // what happens if the experiment is already killed? do we need to change beforeAll logic?
    // });
    // await test.step('Move', async () => {
    //   // move to where? do we need a new project? check project spec
    // });
    // await test.step('Archive / Unarchive', async () => {
    //   // what happens if the experiment is already archived?
    // });
    // await test.step('View in Tensorboard', async () => {
    //   // might want something like this
    //   // await authedPage.waitForURL(;
    // });
    // await test.step('Hyperparameter Search', async () => {});
  });

  test('DataGrid Action Pause', async () => {
    // datagrid can be slow, perhaps related to [ET-677]
    projectDetailsPage._page.setDefaultTimeout(10000);

    // experiment should initially be paused
    const row = projectDetailsPage.f_experimentList.dataGrid.getRowByIndex(0);
    await expect.soft((await row.getCellByColumnName('State')).pwLocator).toHaveText('paused');

    // resume experiment
    await row.experimentActionDropdown.open();
    await row.experimentActionDropdown.resume.pwLocator.click();
    await expect.soft((await row.getCellByColumnName('State')).pwLocator).not.toHaveText('paused');

    // pause experiment again
    await row.experimentActionDropdown.open();
    await row.experimentActionDropdown.pause.pwLocator.click();
    await expect.soft((await row.getCellByColumnName('State')).pwLocator).toHaveText('paused');
  });

  test('Datagrid Bulk Action', async () => {
    // should probably go last/before move
    await test.step('Kill', async () => {
      type RowType = typeof projectDetailsPage.f_experimentList.dataGrid.rows;
      const rows = [0, 1].map((idx) => {
        return projectDetailsPage.f_experimentList.dataGrid.getRowByIndex(idx);
      });
      const expectStateForRow = async (state: string, row: RowType) => {
        const stateColumn = await row.getCellByColumnName('State');
        await expect(stateColumn.pwLocator).toHaveText(state);
      };
      await rows.reduce(async (memo, row) => {
        await memo;
        await expectStateForRow('paused', row);
        await row.clickColumn('Select');
      }, Promise.resolve());

      await projectDetailsPage.f_experimentList.tableActionBar.actions.kill.select();

      // TODO: modal component model assumes buttons are attached to form
      await projectDetailsPage.pwLocator.getByRole('button', { name: 'kill' }).click();

      await expect(async () => {
        await Promise.all([
          ...rows.map(expectStateForRow.bind(this, 'canceled')),
          expectStateForRow(
            'paused',
            projectDetailsPage.f_experimentList.dataGrid.getRowByIndex(2),
          ),
        ]);
      }).toPass();
    });
  });

  test.describe('Experiment List Pagination', () => {
    test.beforeAll(({ newProject }) => {
      Array(51)
        .fill(null)
        .forEach(() => {
          detExecSync(
            `experiment create ${fullPath('examples/tutorials/mnist_pytorch/adaptive.yaml')} --paused --project_id ${newProject.response.project.id}`,
          );
        });
    });
    test.beforeEach(async () => {
      await test.step('Ensure pagination options', async () => {
        const pageSizeSelect = projectDetailsPage.f_experimentList.pagination.perPage;
        const pageSize = await pageSizeSelect.selectionItem.pwLocator.textContent();
        if (!pageSize?.startsWith('20')) {
          await pageSizeSelect.selectMenuOption('20 / page');
          await waitTableStable();
        }
      });
    });
    test('Pagination', async () => {
      const pollWatch = () =>
        projectDetailsPage._page.waitForResponse((res) => {
          return res.url().endsWith('experiments-search');
        });
      const expectPageNumber = (pageParam: string | null) => {
        const params = new URL(projectDetailsPage._page.url()).searchParams;
        expect(params.get('page')).toBe(pageParam);
      };
      // table is virtualized so row counts are not reliable.
      const nextPageUpdate = pollWatch();
      await projectDetailsPage.f_experimentList.pagination.next.pwLocator.click();
      await nextPageUpdate;
      expectPageNumber('1');

      const buttonPageUpdate = pollWatch();
      await projectDetailsPage.f_experimentList.pagination.pageButtonLocator(3).click();
      await buttonPageUpdate;
      expectPageNumber('2');

      const perPageUpdate = pollWatch();
      await projectDetailsPage.f_experimentList.pagination.perPage.selectMenuOption('80 / page');
      await perPageUpdate;
      expectPageNumber(null);
    });
  });
  test.describe('Experiment List Multi-sort', () => {
    type sort = { column: string; direction: 'asc' | 'desc' };

    // best-effort column text parsing -- may need to read the actual column defs to be perfect
    const parseColumnText = (text: string) => {
      if (text === '-') {
        return null;
      }
      const num = Number(text);
      if (!Number.isNaN(num)) {
        return num;
      }
      const date = dayjs.utc(text);
      if (date.isValid()) {
        return date;
      }
      return text;
    };
    const testSorts = (sorts: sort[]) => {
      const lastSort = sorts[sorts.length - 1];
      const sortTextList = sorts
        .slice(0, -1)
        .map((s) => `${s.column} ${s.direction}`)
        .join(', ');

      return test(`Sort by ${sortTextList} and ${lastSort.column} ${lastSort.direction}`, async () => {
        await test.step('Set Up Sorts', async () => {
          const multiSortMenu = projectDetailsPage.f_experimentList.tableActionBar.multiSortMenu;
          await multiSortMenu.open();
          await multiSortMenu.multiSort.reset.pwLocator.click();
          // weirdness alert: reset closes the sort menu normally, but doesn't
          // in playwright locally. in ci the locators become unstable
          await multiSortMenu.close();
          await multiSortMenu.open();

          for (let i = 0; i < sorts.length; i++) {
            const sort = sorts[i];
            const sortRow = multiSortMenu.multiSort.rows.nth(i);
            await sortRow.column.selectMenuOption(sort.column);
            // select order menu item by value not label
            await sortRow.order.openMenu();
            await sortRow.order._menu.pwLocator
              .locator(`[data-select-value="${sort.direction}"]`)
              .click();
            if (i < sorts.length - 1) {
              await multiSortMenu.multiSort.add.pwLocator.click();
            }
          }
          await multiSortMenu.close();
          await waitTableStable();
        });

        await test.step('Verify Order', async () => {
          const rows = await projectDetailsPage.f_experimentList.dataGrid.filterRows(() =>
            Promise.resolve(true),
          );
          const getValuesForRow = async (r: ExperimentRow) => {
            const rowColumnValues = await Promise.all(
              sorts.map(async ({ column }) => ({
                [column]: await (await r.getCellByColumnName(column)).pwLocator.innerText(),
              })),
            );
            return Object.assign({}, ...rowColumnValues);
          };
          const rowValues = await Promise.all(rows.map(getValuesForRow));
          // sorting all values at the same time to make reported failures easier to decipher
          // it'd be nice to use _.orderBy, but it's harder to suss out the null placement logic
          const expectedOrder = [...rowValues].sort((rowA, rowB) => {
            for (const sort of sorts) {
              const isAscending = sort.direction === 'asc';
              const valueA = parseColumnText(rowA[sort.column]);
              const valueB = parseColumnText(rowB[sort.column]);
              // nulls are always last
              if (valueA === null && valueB !== null) {
                return 1;
              }
              if (valueB === null && valueA !== null) {
                return -1;
              }
              if (typeof valueA === 'string' && typeof valueB === 'string' && valueA !== valueB) {
                const cmpValue = valueA < valueB ? -1 : 1;
                return isAscending ? cmpValue : cmpValue * -1;
              }
              if (typeof valueA === 'number' && typeof valueB === 'number' && valueA !== valueB) {
                const cmpValue = valueA - valueB;
                return isAscending ? cmpValue : cmpValue * -1;
              }
              if (dayjs.isDayjs(valueA) && dayjs.isDayjs(valueB) && !valueA.isSame(valueB)) {
                const cmpValue = valueA.isBefore(valueB) ? -1 : 1;
                return isAscending ? cmpValue : cmpValue * -1;
              }
              // if types are different or values are same, skip the column
            }
            return 0;
          });
          expect(rowValues).toEqual(expectedOrder);
        });
      });
    };

    test.beforeAll(({ newProject }) => {
      // create a new experiment for comparing Searcher Metric and Trial Count
      detExecSync(
        `experiment create ${fullPath('examples/tutorials/core_api_pytorch_mnist/checkpoints.yaml')} --paused --project_id ${newProject.response.project.id}`,
      );
    });

    // set table columns to have just the columns that we are using in the test cases.
    test.beforeEach(async ({ authedPage, newProject }) => {
      projectDetailsPage = new ProjectDetails(authedPage);
      await projectDetailsPage.gotoProject(newProject.response.project.id);
      const columnPicker = projectDetailsPage.f_experimentList.tableActionBar.columnPickerMenu;
      await columnPicker.open();
      const showAllButton = columnPicker.columnPickerTab.showAll.pwLocator;
      await showAllButton.click();
      if ((await showAllButton.textContent()) === 'Hide all') {
        await showAllButton.click();
      }

      const columnTitles = ['id', 'searcherType', 'numTrials', 'searcherMetric'];

      for (const title of columnTitles) {
        const checkbox = columnPicker.columnPickerTab.columns.listItem(title).checkbox;
        await checkbox.pwLocator.check();
      }

      await columnPicker.close();

      await projectDetailsPage.f_experimentList.dataGrid.headRow.setColumnDefs();
    });

    testSorts([
      { column: 'ID', direction: 'asc' },
      { column: 'Searcher', direction: 'asc' },
    ]);

    testSorts([
      { column: 'ID', direction: 'desc' },
      { column: 'Searcher', direction: 'desc' },
    ]);

    testSorts([
      { column: 'Trial count', direction: 'asc' },
      { column: 'Searcher Metric', direction: 'asc' },
    ]);

    testSorts([
      { column: 'Trial count', direction: 'desc' },
      { column: 'Searcher Metric', direction: 'desc' },
    ]);
  });

  test.describe('Row Actions', () => {
    let destinationProject: V1Project;
    let experimentId: number;

    // create a new project, workspace and experiment
    test.beforeAll(
      async ({
        backgroundApiProject,
        newProject: {
          response: { project },
        },
      }) => {
        destinationProject = (
          await backgroundApiProject.createProject(
            project.workspaceId,
            backgroundApiProject.new({ projectProps: { workspaceId: project.workspaceId } }),
          )
        ).project;

        const expId = Number(
          detExecSync(
            `experiment create ${fullPath('examples/tutorials/mnist_pytorch/adaptive.yaml')} --paused --project_id ${project.id}`,
          ).split(' ')[2],
        ); // returns in the format "Created experiment <exp_id>"

        if (Number.isNaN(expId)) throw new Error('No experiment ID was found');

        experimentId = expId;
      },
    );

    // cleanup
    test.afterAll(async ({ backgroundApiProject }) => {
      if (experimentId !== undefined) {
        detExecSync(`experiment kill ${experimentId}`);
        detExecSync(`experiment delete ${experimentId} --y`);
      }

      await backgroundApiProject.deleteProject(destinationProject.id);
    });

    test('move experiment', async ({
      newWorkspace: {
        response: { workspace },
      },
    }) => {
      if (experimentId === undefined) throw new Error('No experiment ID was found');

      const newExperimentRow =
        await projectDetailsPage.f_experimentList.dataGrid.getRowByColumnValue(
          'ID',
          experimentId.toString(),
        );

      const experimentActionDropdown = await newExperimentRow.experimentActionDropdown.open();

      await experimentActionDropdown.menuItem('Move').pwLocator.click();
      await experimentActionDropdown.moveModal.destinationWorkspace.selectMenuOption(
        workspace.name,
      );
      await experimentActionDropdown.moveModal.destinationProject.pwLocator.waitFor({
        state: 'visible',
      });
      await experimentActionDropdown.moveModal.destinationProject.selectMenuOption(
        destinationProject.name,
      );
      await experimentActionDropdown.moveModal.footer.submit.pwLocator.click();
      await experimentActionDropdown.moveModal.pwLocator.waitFor({ state: 'hidden' });

      await newExperimentRow.pwLocator.waitFor({ state: 'hidden' });

      await projectDetailsPage.gotoProject(destinationProject.id);
      const grid = projectDetailsPage.f_experimentList.dataGrid;
      await grid.setColumnHeight();
      await grid.headRow.setColumnDefs();
      const newProjectRows = await projectDetailsPage.f_experimentList.dataGrid.filterRows(() =>
        Promise.resolve(true),
      );
      await expect(newProjectRows.length).toBe(1);
    });
  });
});
