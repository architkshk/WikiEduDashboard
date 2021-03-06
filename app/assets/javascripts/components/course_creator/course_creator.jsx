import React from 'react';
import createReactClass from 'create-react-class';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { Link } from 'react-router-dom';
import _ from 'lodash';

import { updateCourse } from '../../actions/course_actions';
import { fetchCampaign, submitCourse, cloneCourse } from '../../actions/course_creation_actions.js';
import { fetchCoursesForUser } from '../../actions/user_courses_actions.js';
import { setValid, setInvalid, checkCourseSlug, activateValidations } from '../../actions/validation_actions';
import { getCloneableCourses, isValid, firstValidationErrorMessage } from '../../selectors';

import Notifications from '../common/notifications.jsx';
import Modal from '../common/modal.jsx';
import TextInput from '../common/text_input.jsx';
import DatePicker from '../common/date_picker.jsx';
import TextAreaInput from '../common/text_area_input.jsx';
import CourseUtils from '../../utils/course_utils.js';
import CourseDateUtils from '../../utils/course_date_utils.js';
import CourseLevelSelector from './course_level_selector.jsx';
import CourseType from './course_type.jsx';

const CourseCreator = createReactClass({
  displayName: 'CourseCreator',

  propTypes: {
    course: PropTypes.object.isRequired,
    cloneableCourses: PropTypes.array.isRequired,
    fetchCoursesForUser: PropTypes.func.isRequired,
    courseCreator: PropTypes.object.isRequired,
    updateCourse: PropTypes.func.isRequired,
    submitCourse: PropTypes.func.isRequired,
    fetchCampaign: PropTypes.func.isRequired,
    cloneCourse: PropTypes.func.isRequired,
    loadingUserCourses: PropTypes.bool.isRequired,
    setValid: PropTypes.func.isRequired,
    setInvalid: PropTypes.func.isRequired,
    checkCourseSlug: PropTypes.func.isRequired,
    isValid: PropTypes.bool.isRequired,
    validations: PropTypes.object.isRequired,
    firstErrorMessage: PropTypes.string,
    activateValidations: PropTypes.func.isRequired
  },

  getInitialState() {
    return {
      tempCourseId: '',
      isSubmitting: false,
      showCourseForm: false,
      showCloneChooser: false,
      showEventDates: false,
      showWizardForm: false,
      default_course_type: this.props.courseCreator.defaultCourseType,
      course_string_prefix: this.props.courseCreator.courseStringPrefix,
      use_start_and_end_times: this.props.courseCreator.useStartAndEndTimes
    };
  },

  componentWillMount() {
    // If a campaign slug is provided, fetch the campaign.
    const campaignParam = this.campaignParam();
    if (campaignParam) {
      this.props.fetchCampaign(campaignParam);
    }
    this.props.fetchCoursesForUser(window.currentUser.id);
  },

  componentWillReceiveProps(nextProps) {
    if (nextProps.course.school !== '' && nextProps.course.title !== '') {
      this.state.tempCourseId = CourseUtils.generateTempId(nextProps.course);
    } else {
      this.state.tempCourseId = '';
    }
    return this.handleCourse(nextProps.course, nextProps.isValid);
  },

  campaignParam() {
    // The regex allows for any number of URL parameters, while only capturing the campaign_slug parameter
    const campaignParam = window.location.search.match(/\?.*?campaign_slug=(.*?)(?:$|&)/);
    if (campaignParam) {
      return campaignParam[1];
    }
  },

  saveCourse() {
    this.props.activateValidations();
    if (this.props.isValid && this.expectedStudentsIsValid() && this.dateTimesAreValid()) {
      this.setState({ isSubmitting: true });
      this.props.setInvalid(
        'exists',
        CourseUtils.i18n('creator.checking_for_uniqueness', this.state.course_string_prefix),
        true
      );
      return this.props.checkCourseSlug(CourseUtils.generateTempId(this.props.course));
    }
  },

  handleCourse(course, isValidProp) {
    if (this.state.shouldRedirect === true) {
      window.location = `/courses/${course.slug}`;
      return this.setState({ shouldRedirect: false });
    }

    if (!this.state.isSubmitting && !this.state.justSubmitted) {
      return;
    }
    if (isValidProp) {
      if (course.slug && this.state.justSubmitted) {
        // This has to be a window.location set due to our limited ReactJS scope
        if (this.state.default_course_type === 'ClassroomProgramCourse') {
          window.location = `/courses/${course.slug}/timeline/wizard`;
        } else {
          window.location = `/courses/${course.slug}`;
        }
      } else if (!this.state.justSubmitted) {
        const cleanedCourse = CourseUtils.cleanupCourseSlugComponents(course);
        this.setState({ course: cleanedCourse });
        this.setState({ isSubmitting: false });
        this.setState({ justSubmitted: true });
        // If the save callback fails, which will happen if an invalid wiki is submitted,
        // then we must reset justSubmitted so that the user can fix the problem
        // and submit again.
        const onSaveFailure = () => this.setState({ justSubmitted: false });
        this.props.submitCourse({ course: cleanedCourse }, onSaveFailure);
      }
    } else if (!this.props.validations.exists.valid) {
      this.setState({ isSubmitting: false });
    }
  },

  showEventDates() {
    return this.setState({ showEventDates: !this.state.showEventDates });
  },

  updateCourse(key, value) {
    this.props.updateCourse({ [key]: value });
    if (_.includes(['title', 'school', 'term'], key)) {
      return this.props.setValid('exists');
    }
  },

  updateCourseType(key, value) {
    this.props.updateCourse({ [key]: value });
  },

  updateCourseDates(key, value) {
    const updatedCourse = CourseDateUtils.updateCourseDates(this.props.course, key, value);
    this.props.updateCourse(updatedCourse);
  },

  updateCoursePrivacy(e) {
    const isPrivate = e.target.checked;
    this.props.updateCourse({ private: isPrivate });
    this.updateCourse('private', isPrivate);
  },

  expectedStudentsIsValid() {
    if (this.props.course.expected_students === '0' && this.state.default_course_type === 'ClassroomProgramCourse') {
      this.props.setInvalid('expected_students', I18n.t('application.field_required'));
      return false;
    }
    return true;
  },

  dateTimesAreValid() {
    const startDateTime = new Date(this.props.course.start);
    const endDateTime = new Date(this.props.course.end);
    const startEventTime = new Date(this.props.timeline_start);
    const endEventTime = new Date(this.props.timeline_end);

    if (startDateTime >= endDateTime || startEventTime >= endEventTime) {
      this.props.setInvalid('end', I18n.t('application.field_invalid_date_time'));
      return false;
    }
    return true;
  },

  showCourseForm(programName) {
    this.updateCourseType('type', programName);

    return this.setState({
      showCourseForm: true,
      showWizardForm: false
    });
  },

  showCloneChooser() {
    return this.setState({ showCloneChooser: true });
  },

  cancelClone() {
    return this.setState({ showCloneChooser: false });
  },

  chooseNewCourse() {
    if (Features.wikiEd) {
      this.setState({ showCourseForm: true });
    } else {
      this.setState({ showWizardForm: true });
    }
  },

  useThisClass() {
    const select = this.courseSelect;
    const courseId = select.options[select.selectedIndex].getAttribute('data-id-key');
    this.props.cloneCourse(courseId);
    return this.setState({ isSubmitting: true, shouldRedirect: true });
  },

  render() {
    if (this.props.loadingUserCourses) {
      return <div />;
    }
    // There are four fundamental states: NewOrClone, CourseForm, wizardForm and CloneChooser
    let showCourseForm;
    let showCloneChooser;
    let showNewOrClone;
    let showWizardForm;
    // If the creator was launched from a campaign, do not offer the cloning option.
    if (this.campaignParam()) {
      showCourseForm = true;
    } else if (this.state.showWizardForm) {
      showWizardForm = true;
    } else if (this.state.showCourseForm) {
      showCourseForm = true;
    } else if (this.state.showCloneChooser) {
      showCloneChooser = true;
    // If user has no courses, just open the CourseForm immediately because there are no cloneable courses.
    } else if (this.props.cloneableCourses.length === 0) {
      if (this.state.showCourseForm || Features.wikiEd) {
        showCourseForm = true;
      } else {
        showWizardForm = true;
      }
    } else {
      showNewOrClone = true;
    }

    let instructions;
    if (showNewOrClone) {
      instructions = CourseUtils.i18n('creator.new_or_clone', this.state.course_string_prefix);
    } else if (showCloneChooser) {
      instructions = CourseUtils.i18n('creator.choose_clone', this.state.course_string_prefix);
    } else if (showCourseForm) {
      instructions = CourseUtils.i18n('creator.intro', this.state.course_string_prefix);
    }

    let formStyle;
    if (this.state.isSubmitting === true) {
      formStyle = { pointerEvents: 'none', opacity: 0.5 };
    }

    let courseFormClass = 'wizard__form';
    let courseWizard = 'wizard__program';

    courseFormClass += showCourseForm ? '' : ' hidden';
    courseWizard += showWizardForm ? '' : ' hidden';

    const cloneOptions = showNewOrClone ? '' : ' hidden';
    const controlClass = `wizard__panel__controls ${courseFormClass}`;
    const selectClass = showCloneChooser ? '' : ' hidden';
    const options = this.props.cloneableCourses.map((course, i) => <option key={i} data-id-key={course.id}>{course.title}</option>);
    const selectClassName = `select-container ${selectClass}`;
    const eventFormClass = this.state.showEventDates ? '' : 'hidden';
    const eventClass = `${eventFormClass}`;


    let term;
    let subject;
    let expectedStudents;
    let courseLevel;
    let roleDescription;

    let descriptionRequired = false;
    if (this.state.default_course_type === 'ClassroomProgramCourse') {
      descriptionRequired = true;
      term = (
        <TextInput
          id="course_term"
          onChange={this.updateCourse}
          value={this.props.course.term}
          value_key="term"
          required
          validation={CourseUtils.courseSlugRegex()}
          editable
          label={CourseUtils.i18n('creator.course_term', this.state.course_string_prefix)}
          placeholder={CourseUtils.i18n('creator.course_term_placeholder', this.state.course_string_prefix)}
        />
      );
      courseLevel = (
        <CourseLevelSelector
          level={this.props.course.level}
          updateCourse={this.updateCourse}
        />
      );
      subject = (
        <TextInput
          id="course_subject"
          onChange={this.updateCourse}
          value={this.props.course.subject}
          value_key="subject"
          editable
          label={CourseUtils.i18n('creator.course_subject', this.state.course_string_prefix)}
          placeholder={I18n.t('courses.creator.subject')}
        />
      );
      expectedStudents = (
        <TextInput
          id="course_expected_students"
          onChange={this.updateCourse}
          value={String(this.props.course.expected_students)}
          value_key="expected_students"
          editable
          required
          type="number"
          max="999"
          label={CourseUtils.i18n('creator.expected_number', this.state.course_string_prefix)}
          placeholder={CourseUtils.i18n('creator.expected_number', this.state.course_string_prefix)}
        />
      );
      roleDescription = (
        <TextInput
          id="role_description"
          onChange={this.updateCourse}
          value={this.props.course.role_description}
          value_key="role_description"
          editable
          label={I18n.t('courses.creator.role_description')}
          placeholder={I18n.t('courses.creator.role_description_placeholder')}
        />
      );
    }

    let language;
    let project;
    let privacyCheckbox;
    let campaign;
    if (this.state.default_course_type !== 'ClassroomProgramCourse') {
      language = (
        <TextInput
          id="course_language"
          onChange={this.updateCourse}
          value={this.props.course.language}
          value_key="language"
          editable
          label={I18n.t('courses.creator.course_language')}
          placeholder="en"
        />
      );
      project = (
        <TextInput
          id="course_project"
          onChange={this.updateCourse}
          value={this.props.course.project}
          value_key="project"
          editable
          label={I18n.t('courses.creator.course_project')}
          placeholder="wikipedia"
        />
      );
      privacyCheckbox = (
        <div className="form-group">
          <label htmlFor="course_private">{I18n.t('courses.creator.course_private')}:</label>
          <input
            id="course_private"
            type="checkbox"
            value={true}
            onChange={this.updateCoursePrivacy}
            checked={!!this.props.course.private}
          />
        </div>
      );
    }
    if (this.props.course.initial_campaign_title) {
      campaign = (
        <TextInput
          value={this.props.course.initial_campaign_title}
          label={I18n.t('campaign.campaign')}
        />
      );
    }

    const dateProps = CourseDateUtils.dateProps(this.props.course);
    const timeZoneMessage = (
      <p className="form-help-text">
        {I18n.t('courses.time_zone_message')}
      </p>
    );
    let eventCheckbox;
    let timelineStart;
    let timelineEnd;
    if (this.state.default_course_type !== 'ClassroomProgramCourse') {
      eventCheckbox = (
        <div className="form-group tooltip-trigger">
          <label htmlFor="course_event">
            {I18n.t('courses.creator.separate_event_dates')}
            <span className="tooltip-indicator" />
          </label>
          <div className="tooltip dark">
            <p>{I18n.t('courses.creator.separate_event_dates_info')}</p>
          </div>
          <input
            id="course_event"
            type="checkbox"
            value={true}
            onChange={this.showEventDates}
            checked={!!this.state.showEventDates}
          />
        </div>
      );
      timelineStart = (
        <DatePicker
          id="course_timeline_start"
          onChange={this.updateCourseDates}
          value={this.props.course.timeline_start}
          value_key="timeline_start"
          editable
          label={CourseUtils.i18n('creator.assignment_start', this.state.course_string_prefix)}
          placeholder={I18n.t('courses.creator.assignment_start_placeholder')}
          blank
          isClearable={true}
          showTime={this.state.use_start_and_end_times}
        />
      );
      timelineEnd = (
        <DatePicker
          id="course_timeline_end"
          onChange={this.updateCourseDates}
          value={this.props.course.timeline_end}
          value_key="timeline_end"
          editable
          label={CourseUtils.i18n('creator.assignment_end', this.state.course_string_prefix)}
          placeholder={I18n.t('courses.creator.assignment_end_placeholder')}
          blank
          date_props={dateProps.timeline_end}
          enabled={!!this.props.course.timeline_start}
          isClearable={true}
          showTime={this.state.use_start_and_end_times}
        />
      );
    }

    return (
      <Modal key="modal">
        <Notifications />
        <div className="container">
          <div className="wizard__panel active" style={formStyle}>
            <h3>{CourseUtils.i18n('creator.create_new', this.state.course_string_prefix)}</h3>
            <p>{instructions}</p>
            <div className={cloneOptions}>
              <button className="button dark" onClick={this.chooseNewCourse}>{CourseUtils.i18n('creator.create_label', this.state.course_string_prefix)}</button>
              <button className="button dark" onClick={this.showCloneChooser}>{CourseUtils.i18n('creator.clone_previous', this.state.course_string_prefix)}</button>
            </div>
            <CourseType
              wizardClass={courseWizard}
              wizardAction={this.showCourseForm}
            />
            <div className={selectClassName}>
              <select id="reuse-existing-course-select" ref={(dropdown) => { this.courseSelect = dropdown; }}>{options}</select>
              <button className="button dark" onClick={this.useThisClass}>{CourseUtils.i18n('creator.clone_this', this.state.course_string_prefix)}</button>
              <button className="button dark right" onClick={this.cancelClone}>{CourseUtils.i18n('cancel', this.state.course_string_prefix)}</button>
            </div>
            <div className={courseFormClass}>
              <div className="column">

                {campaign}
                <TextInput
                  id="course_title"
                  onChange={this.updateCourse}
                  value={this.props.course.title}
                  value_key="title"
                  required
                  validation={CourseUtils.courseSlugRegex()}
                  editable
                  label={CourseUtils.i18n('creator.course_title', this.state.course_string_prefix)}
                  placeholder={CourseUtils.i18n('creator.course_title', this.state.course_string_prefix)}
                />
                <TextInput
                  id="course_school"
                  onChange={this.updateCourse}
                  value={this.props.course.school}
                  value_key="school"
                  required
                  validation={CourseUtils.courseSlugRegex()}
                  editable
                  label={CourseUtils.i18n('creator.course_school', this.state.course_string_prefix)}
                  placeholder={CourseUtils.i18n('creator.course_school', this.state.course_string_prefix)}
                />
                {term}
                {courseLevel}
                {subject}
                {expectedStudents}
                {language}
                {project}
                {privacyCheckbox}
              </div>
              <div className="column">
                <DatePicker
                  id="course_start"
                  onChange={this.updateCourseDates}
                  value={this.props.course.start}
                  value_key="start"
                  required
                  editable
                  label={CourseUtils.i18n('creator.start_date', this.state.course_string_prefix)}
                  placeholder={I18n.t('courses.creator.start_date_placeholder')}
                  blank
                  isClearable={false}
                  showTime={this.state.use_start_and_end_times}
                />
                <DatePicker
                  id="course_end"
                  onChange={this.updateCourseDates}
                  value={this.props.course.end}
                  value_key="end"
                  required
                  editable
                  label={CourseUtils.i18n('creator.end_date', this.state.course_string_prefix)}
                  placeholder={I18n.t('courses.creator.end_date_placeholder')}
                  blank
                  date_props={dateProps.end}
                  enabled={!!this.props.course.start}
                  isClearable={false}
                  showTime={this.state.use_start_and_end_times}
                />
                {eventCheckbox}
                <span className={eventClass}>
                  {timelineStart}
                  {timelineEnd}
                </span>
                {this.state.use_start_and_end_times ? timeZoneMessage : null}
                <span className="text-input-component__label"><strong>{CourseUtils.i18n('creator.course_description', this.state.course_string_prefix)}:</strong></span>
                <TextAreaInput
                  id="course_description"
                  onChange={this.updateCourse}
                  value={this.props.course.description}
                  value_key="description"
                  required={descriptionRequired}
                  editable
                  placeholder={CourseUtils.i18n('creator.course_description_placeholder', this.state.course_string_prefix)}
                />
                {roleDescription}
              </div>
            </div>
            <div className={controlClass}>
              <div className="left"><p>{this.state.tempCourseId}</p></div>
              <div className="right">
                <div><p className="red">{this.props.firstErrorMessage}</p></div>
                <Link className="button" to="/" id="course_cancel">{I18n.t('application.cancel')}</Link>
                <button onClick={this.saveCourse} className="dark button button__submit">{CourseUtils.i18n('creator.create_button', this.state.course_string_prefix)}</button>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    );
  }
});

const mapStateToProps = state => ({
  course: state.course,
  courseCreator: state.courseCreator,
  cloneableCourses: getCloneableCourses(state),
  loadingUserCourses: state.userCourses.loading,
  validations: state.validations.validations,
  isValid: isValid(state),
  firstErrorMessage: firstValidationErrorMessage(state)
});

const mapDispatchToProps = ({
  fetchCampaign,
  fetchCoursesForUser,
  updateCourse,
  submitCourse,
  cloneCourse,
  setValid,
  setInvalid,
  checkCourseSlug,
  activateValidations
});

// exporting two difference ways as a testing hack.
export const ConnectedCourseCreator = connect(mapStateToProps, mapDispatchToProps)(CourseCreator);

export default CourseCreator;
